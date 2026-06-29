/**
 * Analytics queries — semua return plain objects, siap di-JSON-serialize.
 * Semua query non-destructive (SELECT only).
 */

export async function engagementStats(pool, { platform, username }) {
  const { rows } = await pool.query(
    `SELECT
       p.username,
       COUNT(po.id)                                             AS post_count,
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
     FROM scraped_profiles p
     JOIN scraped_posts po
       ON po.author_username = p.username AND po.platform = p.platform
     WHERE p.platform = $1 AND p.username = $2
     GROUP BY p.username`,
    [platform, username]
  );
  return rows[0] ?? null;
}

export async function topPosts(pool, { platform, username, limit = 10 }) {
  const { rows } = await pool.query(
    `SELECT
       post_url, post_id, content,
       likes_count, comments_count, shares_count, views_count,
       (likes_count + comments_count + shares_count) AS total_engagement,
       hashtags, media_urls, posted_at, scraped_at
     FROM scraped_posts
     WHERE platform = $1 AND author_username = $2
     ORDER BY total_engagement DESC
     LIMIT $3`,
    [platform, username, limit]
  );
  return rows;
}

export async function hashtagStats(pool, { platform, username, limit = 20 }) {
  const { rows } = await pool.query(
    `SELECT
       unnest(hashtags)                             AS hashtag,
       COUNT(*)                                     AS usage_count,
       ROUND(AVG(likes_count + comments_count), 1) AS avg_engagement
     FROM scraped_posts
     WHERE platform = $1
       AND author_username = $2
       AND array_length(hashtags, 1) > 0
     GROUP BY hashtag
     ORDER BY usage_count DESC, avg_engagement DESC
     LIMIT $3`,
    [platform, username, limit]
  );
  return rows;
}

export async function postingFrequency(pool, { platform, username, days = 30 }) {
  const { rows } = await pool.query(
    `SELECT
       DATE_TRUNC('day', scraped_at)::date AS day,
       COUNT(*)                            AS post_count,
       SUM(likes_count)                    AS total_likes,
       SUM(comments_count)                 AS total_comments
     FROM scraped_posts
     WHERE platform = $1
       AND author_username = $2
       AND scraped_at > NOW() - ($3 || ' days')::INTERVAL
     GROUP BY day
     ORDER BY day`,
    [platform, username, days]
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
