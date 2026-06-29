import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const { Pool } = pg;
const SCHEMA_PATH = path.resolve(fileURLToPath(import.meta.url), '../../../db/init.sql');

export class DataStore {
  #pool;

  constructor({ host = 'localhost', port = 5432, database = 'scraper', user = 'scraper', password = '' } = {}) {
    this.#pool = new Pool({ host, port, database, user, password, max: 5, idleTimeoutMillis: 30000 });
  }

  /** Init schema — retry sampai DB siap (Docker startup race condition) */
  async init({ retries = 10, delayMs = 3000 } = {}) {
    for (let i = 1; i <= retries; i++) {
      try {
        const sql = await readFile(SCHEMA_PATH, 'utf8');
        await this.#pool.query(sql);
        return;
      } catch (err) {
        if (i === retries) throw err;
        console.warn(`[DataStore] DB not ready (attempt ${i}/${retries}): ${err.message}`);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  async close() {
    await this.#pool.end();
  }

  // ─────────────────────────────────────────────
  // Job CRUD
  // ─────────────────────────────────────────────

  async saveJob({ id, platform, targetUrl, profileName = 'openclaw', status = 'pending', webhookUrl = null }) {
    await this.#pool.query(
      `INSERT INTO scraper_jobs (id, platform, target_url, profile_name, status, webhook_url)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, platform, targetUrl, profileName, status, webhookUrl]
    );
  }

  async updateJob(id, { status, error, resultCount } = {}) {
    await this.#pool.query(
      `UPDATE scraper_jobs
       SET status       = COALESCE($2, status),
           error        = COALESCE($3, error),
           result_count = COALESCE($4, result_count),
           updated_at   = NOW()
       WHERE id = $1`,
      [id, status ?? null, error ?? null, resultCount ?? null]
    );
  }

  async getJob(id) {
    const { rows } = await this.#pool.query(
      'SELECT * FROM scraper_jobs WHERE id = $1',
      [id]
    );
    return rows[0] ?? null;
  }

  async listJobs({ platform, status, limit = 50, offset = 0 } = {}) {
    const conditions = [];
    const params = [];
    if (platform) { conditions.push(`platform = $${params.push(platform)}`); }
    if (status)   { conditions.push(`status = $${params.push(status)}`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);
    const { rows } = await this.#pool.query(
      `SELECT * FROM scraper_jobs ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return rows;
  }

  async deleteJob(id) {
    await this.#pool.query('DELETE FROM scraper_jobs WHERE id = $1', [id]);
  }

  // ─────────────────────────────────────────────
  // Results — profile + posts dalam satu transaksi
  // ─────────────────────────────────────────────

  async saveResults(jobId, platform, { profile, posts = [] }) {
    const client = await this.#pool.connect();
    try {
      await client.query('BEGIN');

      if (profile) {
        await client.query(
          `INSERT INTO scraped_profiles
             (job_id, platform, username, display_name, bio,
              followers_count, following_count, posts_count,
              verified, profile_url, avatar_url, extra)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            jobId, platform,
            profile.username, profile.displayName ?? null, profile.bio ?? null,
            profile.followersCount ?? null, profile.followingCount ?? null, profile.postsCount ?? null,
            profile.verified ?? false, profile.profileUrl ?? null, profile.avatarUrl ?? null,
            profile.extra ? JSON.stringify(profile.extra) : null
          ]
        );
      }

      for (const post of posts) {
        await client.query(
          `INSERT INTO scraped_posts
             (job_id, platform, post_url, post_id, author_username,
              content, likes_count, comments_count, shares_count, views_count,
              hashtags, media_urls, posted_at, extra)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [
            jobId, platform,
            post.postUrl ?? null, post.postId ?? null, post.authorUsername,
            post.content ?? null,
            post.likesCount ?? 0, post.commentsCount ?? 0,
            post.sharesCount ?? 0, post.viewsCount ?? 0,
            post.hashtags ?? [], post.mediaUrls ?? [],
            post.postedAt ?? null,
            post.extra ? JSON.stringify(post.extra) : null
          ]
        );
      }

      await client.query(
        'UPDATE scraper_jobs SET result_count = $2, status = $3, updated_at = NOW() WHERE id = $1',
        [jobId, posts.length, 'done']
      );

      await client.query('COMMIT');
      return { postCount: posts.length };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getResults(jobId) {
    const [{ rows: profiles }, { rows: posts }] = await Promise.all([
      this.#pool.query('SELECT * FROM scraped_profiles WHERE job_id = $1', [jobId]),
      this.#pool.query('SELECT * FROM scraped_posts WHERE job_id = $1 ORDER BY scraped_at', [jobId])
    ]);
    return { profiles, posts };
  }

  // expose pool for analytics queries
  get pool() { return this.#pool; }
}
