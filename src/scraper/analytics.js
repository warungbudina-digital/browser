/**
 * Analytics queries — semua return plain objects, siap di-JSON-serialize.
 * Semua query non-destructive (SELECT only).
 *
 * `scraped_posts` sengaja APPEND-ONLY (1 baris baru per scrape, lihat DataStore.js) —
 * ini DISENGAJA supaya histori metrik per-post (likes/comments/views dari waktu ke
 * waktu) bisa ditarik lewat postGrowth() di bawah, bukan sekadar snapshot terakhir.
 * TAPI akibatnya setiap query "kondisi SEKARANG" (top post, hashtag, rata-rata
 * engagement) HARUS dedupe ke snapshot TERBARU per post dulu — kalau tidak, re-scrape
 * akun yang sama bikin post lama terhitung berkali-kali (dibuktikan nyata 13/11:
 * 2 post gogobud13 ter-scrape 2x jadi 4 baris, top_posts dobel). LATEST_POST di
 * bawah = satu sumber dedup yang dipakai ulang di semua query "kondisi sekarang".
 */
const LATEST_POSTS_CTE = `
  SELECT DISTINCT ON (author_username, COALESCE(post_id, post_url))
    post_url, post_id, author_username, content,
    likes_count, comments_count, shares_count, views_count,
    hashtags, media_urls, posted_at, scraped_at
  FROM scraped_posts
  WHERE platform = $1 AND author_username = $2
  ORDER BY author_username, COALESCE(post_id, post_url), scraped_at DESC
`;

export async function engagementStats(pool, { platform, username }) {
  const { rows } = await pool.query(
    `WITH latest_posts AS (${LATEST_POSTS_CTE})
     SELECT
       p.username,
       COUNT(po.*)                                             AS post_count,
       COALESCE(AVG(po.likes_count), 0)                        AS avg_likes,
       COALESCE(AVG(po.comments_count), 0)                     AS avg_comments,
       COALESCE(AVG(po.shares_count), 0)                       AS avg_shares,
       COALESCE(AVG(po.views_count), 0)                        AS avg_views,
       COALESCE(
         AVG(
           CASE WHEN p.followers_count > 0
             THEN (po.likes_count + po.comments_count)::float / p.followers_count * 100
             ELSE NULL
           END
         ), 0
       )                                                        AS avg_engagement_rate,
       MAX(p.followers_count)                                   AS followers_count
     FROM (
       SELECT DISTINCT ON (username) username, followers_count
       FROM scraped_profiles
       WHERE platform = $1 AND username = $2
       ORDER BY username, scraped_at DESC
     ) p
     LEFT JOIN latest_posts po ON po.author_username = p.username
     GROUP BY p.username`,
    [platform, username]
  );
  return rows[0] ?? null;
}

export async function topPosts(pool, { platform, username, limit = 10 }) {
  const { rows } = await pool.query(
    `WITH latest_posts AS (${LATEST_POSTS_CTE})
     SELECT
       post_url, post_id, content,
       likes_count, comments_count, shares_count, views_count,
       (likes_count + comments_count + shares_count) AS total_engagement,
       hashtags, media_urls, posted_at, scraped_at
     FROM latest_posts
     ORDER BY total_engagement DESC
     LIMIT $3`,
    [platform, username, limit]
  );
  return rows;
}

export async function hashtagStats(pool, { platform, username, limit = 20 }) {
  const { rows } = await pool.query(
    `WITH latest_posts AS (${LATEST_POSTS_CTE})
     SELECT
       unnest(hashtags)                             AS hashtag,
       COUNT(*)                                     AS usage_count,
       ROUND(AVG(likes_count + comments_count), 1) AS avg_engagement
     FROM latest_posts
     WHERE array_length(hashtags, 1) > 0
     GROUP BY hashtag
     ORDER BY usage_count DESC, avg_engagement DESC
     LIMIT $3`,
    [platform, username, limit]
  );
  return rows;
}

export async function postingFrequency(pool, { platform, username, days = 30 }) {
  // Dikelompokkan per tanggal POSTING asli (posted_at), bukan tanggal scrape —
  // supaya "frekuensi posting" benar2 mengukur seberapa sering user upload konten,
  // bukan seberapa sering kita menjalankan scraper. Dedupe ke snapshot terbaru per
  // post dulu (CTE) supaya re-scrape tak menggandakan hitungan post per hari.
  const { rows } = await pool.query(
    `WITH latest_posts AS (${LATEST_POSTS_CTE})
     SELECT
       DATE_TRUNC('day', COALESCE(posted_at, scraped_at))::date AS day,
       COUNT(*)                            AS post_count,
       SUM(likes_count)                    AS total_likes,
       SUM(comments_count)                 AS total_comments
     FROM latest_posts
     WHERE COALESCE(posted_at, scraped_at) > NOW() - ($3 || ' days')::INTERVAL
     GROUP BY day
     ORDER BY day`,
    [platform, username, days]
  );
  return rows;
}

/**
 * Evaluasi SATU post/reel dari waktu ke waktu — histori likes/comments/shares/views
 * tiap kali post itu di-scrape ulang. Ini fitur "evaluasi tiap reel yang saya upload"
 * yang eksplisit diminta user (2026-11-13): butuh RAW history (bukan latest-only),
 * jadi SENGAJA tidak pakai LATEST_POSTS_CTE di atas.
 */
export async function postGrowth(pool, { platform, postId }) {
  const { rows } = await pool.query(
    `SELECT
       post_url, content, likes_count, comments_count, shares_count, views_count,
       scraped_at
     FROM scraped_posts
     WHERE platform = $1 AND post_id = $2
     ORDER BY scraped_at`,
    [platform, postId]
  );
  return rows;
}

export async function profileHistory(pool, { platform, username }) {
  const { rows } = await pool.query(
    `SELECT
       followers_count, following_count, posts_count, scraped_at
     FROM scraped_profiles
     WHERE platform = $1 AND username = $2
     ORDER BY scraped_at`,
    [platform, username]
  );
  return rows;
}

export async function platformSummary(pool, { platform }) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(DISTINCT author_username) AS unique_accounts,
       COUNT(*)                        AS total_posts,
       SUM(likes_count)                AS total_likes,
       SUM(comments_count)             AS total_comments,
       MIN(scraped_at)                 AS first_scraped,
       MAX(scraped_at)                 AS last_scraped
     FROM scraped_posts
     WHERE platform = $1`,
    [platform]
  );
  return rows[0] ?? null;
}
