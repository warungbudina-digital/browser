/**
 * Exporter — query + format konversi untuk export data scraping.
 *
 * Mendukung tiga format output:
 *   json   → { data: [...], total: N }   Content-Type: application/json
 *   csv    → RFC 4180 CSV dengan header   Content-Type: text/csv
 *   ndjson → Newline-Delimited JSON       Content-Type: application/x-ndjson
 *
 * Query langsung via pg Pool — tidak butuh DataStore instance.
 */

export const EXPORT_FORMATS = ['json', 'csv', 'ndjson'];
export const EXPORT_TYPES   = ['posts', 'profiles', 'jobs'];
export const MAX_EXPORT_ROWS = 10_000;

// ─────────────────────────────────────────────
// Query helpers
// ─────────────────────────────────────────────

/**
 * @param {import('pg').Pool} pool
 * @param {{ platform?, jobId?, limit?, offset?, since?, until? }}
 * @returns {Promise<object[]>}
 */
export async function queryPosts(pool, { platform, jobId, limit = 1000, offset = 0, since, until } = {}) {
  const conds  = [];
  const params = [];

  if (platform) conds.push(`platform = $${params.push(platform)}`);
  if (jobId)    conds.push(`job_id = $${params.push(jobId)}`);
  if (since)    conds.push(`scraped_at >= to_timestamp($${params.push(since / 1000)})`);
  if (until)    conds.push(`scraped_at <= to_timestamp($${params.push(until / 1000)})`);

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const cap   = Math.min(Number(limit) || 1000, MAX_EXPORT_ROWS);
  params.push(cap, Number(offset) || 0);

  const { rows } = await pool.query(
    `SELECT job_id, platform, post_id, post_url, author_username,
            content, likes_count, comments_count, shares_count, views_count,
            hashtags, media_urls, posted_at, scraped_at
     FROM scraped_posts
     ${where}
     ORDER BY scraped_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ platform?, jobId?, limit?, offset? }}
 * @returns {Promise<object[]>}
 */
export async function queryProfiles(pool, { platform, jobId, limit = 1000, offset = 0 } = {}) {
  const conds  = [];
  const params = [];

  if (platform) conds.push(`platform = $${params.push(platform)}`);
  if (jobId)    conds.push(`job_id = $${params.push(jobId)}`);

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const cap   = Math.min(Number(limit) || 1000, MAX_EXPORT_ROWS);
  params.push(cap, Number(offset) || 0);

  const { rows } = await pool.query(
    `SELECT job_id, platform, username, display_name, bio,
            followers_count, following_count, posts_count,
            verified, profile_url, avatar_url, scraped_at
     FROM scraped_profiles
     ${where}
     ORDER BY scraped_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ platform?, status?, limit?, offset? }}
 * @returns {Promise<object[]>}
 */
export async function queryJobs(pool, { platform, status, limit = 1000, offset = 0 } = {}) {
  const conds  = [];
  const params = [];

  if (platform) conds.push(`platform = $${params.push(platform)}`);
  if (status)   conds.push(`status = $${params.push(status)}`);

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const cap   = Math.min(Number(limit) || 1000, MAX_EXPORT_ROWS);
  params.push(cap, Number(offset) || 0);

  const { rows } = await pool.query(
    `SELECT id, platform, target_url, profile_name, status,
            result_count, error, webhook_url, created_at, updated_at
     FROM scraper_jobs
     ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

// ─────────────────────────────────────────────
// Format serializers
// ─────────────────────────────────────────────

/**
 * Serialize rows ke format yang diminta.
 * Array-valued fields (hashtags, media_urls) di-join dengan '|' untuk CSV.
 *
 * @param {object[]} rows
 * @param {'json'|'csv'|'ndjson'} format
 * @param {string} [dataKey]  — key untuk JSON wrapper (default: 'data')
 * @returns {string}
 */
export function serialize(rows, format, dataKey = 'data') {
  switch (format) {
    case 'json':   return serializeJson(rows, dataKey);
    case 'ndjson': return serializeNdjson(rows);
    case 'csv':    return serializeCsv(rows);
    default:       throw new Error(`Format tidak dikenal: ${format}`);
  }
}

function serializeJson(rows, dataKey) {
  return JSON.stringify({ [dataKey]: rows, total: rows.length }, null, 2);
}

function serializeNdjson(rows) {
  if (!rows.length) return '';
  return rows.map((r) => JSON.stringify(flattenRow(r))).join('\n') + '\n';
}

function serializeCsv(rows) {
  if (!rows.length) return '';
  const flat    = rows.map(flattenRow);
  const headers = Object.keys(flat[0]);
  const lines   = [headers.join(',')];
  for (const row of flat) {
    lines.push(headers.map((h) => csvCell(row[h])).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

/** Flatten array fields ke pipe-separated string untuk CSV/NDJSON readability. */
function flattenRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (Array.isArray(v)) {
      out[k] = v.join('|');
    } else if (v instanceof Date) {
      out[k] = v.toISOString();
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** RFC 4180 cell escaping. */
function csvCell(value) {
  if (value == null) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\r') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// ─────────────────────────────────────────────
// HTTP helpers
// ─────────────────────────────────────────────

export function contentType(format) {
  return {
    json:   'application/json; charset=utf-8',
    csv:    'text/csv; charset=utf-8',
    ndjson: 'application/x-ndjson; charset=utf-8',
  }[format] ?? 'application/octet-stream';
}

export function filename(type, platform, format) {
  const ts  = new Date().toISOString().slice(0, 10);
  const ext = format === 'ndjson' ? 'ndjson' : format;
  return `${platform ?? 'all'}-${type}-${ts}.${ext}`;
}
