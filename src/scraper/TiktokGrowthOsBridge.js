import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Menjembatani hasil scrape TikTok ke local memory skill `tiktok-growth-os`
 * (analytics.json), supaya `analyze_patterns.py` di skill tersebut bisa
 * mengolah data yang di-scrape otomatis lewat pipeline gRPC CHR -> /scraper/jobs.
 *
 * completion_rate selalu 0 (bukan null) — TikTok tidak mengekspos retention/
 * completion rate di halaman profil publik, hanya tersedia di analytics
 * milik creator sendiri (butuh login), di luar scope scraping publik ini.
 * analyze_patterns.py memanggil mean() atas nilai ini — null akan crash.
 */
export class TiktokGrowthOsBridge {
  #enabled;
  #dir;
  #file;
  #mutex = Promise.resolve();

  constructor({ enabled = false, memoryDir } = {}) {
    this.#enabled = Boolean(enabled) && Boolean(memoryDir);
    this.#dir = memoryDir;
    this.#file = memoryDir ? path.join(memoryDir, 'analytics.json') : null;
  }

  get enabled() {
    return this.#enabled;
  }

  /**
   * Log semua post dari satu job TikTok yang sudah selesai ke analytics.json.
   * Best-effort: tidak pernah throw — caller (JobQueue) tidak boleh gagal
   * karena bridge ini gagal.
   */
  async logResults(jobId, { profile, posts = [] } = {}) {
    if (!this.#enabled) return { ok: false, reason: 'disabled' };
    if (!posts.length) return { ok: false, reason: 'no_posts' };

    const entries = posts.map((post) => this.#toVideoLog(jobId, profile, post));
    return this.#withLock(() => this.#appendVideos(entries));
  }

  // ── field-by-field: normalizePost() shape -> Python make_video_log() shape ──
  #toVideoLog(jobId, profile, post) {
    return {
      id: `VID-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      video_title:
        (post.content ?? '').trim().slice(0, 120) ||
        post.postId ||
        post.postUrl ||
        'Untitled TikTok video',
      topic: '',
      angle: '',
      hook_type: '',
      views: post.viewsCount ?? 0,
      likes: post.likesCount ?? 0,
      comments: post.commentsCount ?? 0,
      shares: post.sharesCount ?? 0,
      completion_rate: 0,
      notes: `Auto-scraped via full-tool-browser job ${jobId}`,
      logged_at: new Date().toISOString(),
      // ── field tambahan untuk traceability — analyze_patterns.py abaikan key tak dikenal ──
      source: 'scraped',
      video_url: post.postUrl ?? null,
      job_id: jobId,
    };
  }

  async #readAnalytics() {
    try {
      const raw = await fs.readFile(this.#file, 'utf8');
      const parsed = JSON.parse(raw);
      return { videos: Array.isArray(parsed?.videos) ? parsed.videos : [] };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return { videos: [] };
    }
  }

  async #writeAnalytics(data) {
    await fs.writeFile(this.#file, JSON.stringify(data, null, 2), 'utf8');
  }

  async #appendVideos(entries) {
    await ensureDir(this.#dir);
    const data = await this.#readAnalytics();
    data.videos.push(...entries);
    await this.#writeAnalytics(data);
    return { ok: true, added: entries.length };
  }

  /** Promise-chain mutex — serialize read-modify-write antar job yang selesai bersamaan. */
  #withLock(fn) {
    const run = this.#mutex.then(fn, fn);
    this.#mutex = run.then(
      () => {},
      () => {}
    );
    return run;
  }
}
