-- =============================================================================
-- Scraper Database Schema
-- =============================================================================

CREATE TABLE IF NOT EXISTS scraper_jobs (
  id          TEXT        PRIMARY KEY,
  platform    TEXT        NOT NULL,
  target_url  TEXT        NOT NULL,
  profile_name TEXT       NOT NULL DEFAULT 'openclaw',
  status      TEXT        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','running','done','failed')),
  error       TEXT,
  result_count INTEGER    DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scraped_profiles (
  id              SERIAL      PRIMARY KEY,
  job_id          TEXT        NOT NULL REFERENCES scraper_jobs(id) ON DELETE CASCADE,
  platform        TEXT        NOT NULL,
  username        TEXT        NOT NULL,
  display_name    TEXT,
  bio             TEXT,
  followers_count BIGINT,
  following_count BIGINT,
  posts_count     BIGINT,
  verified        BOOLEAN     DEFAULT FALSE,
  profile_url     TEXT,
  avatar_url      TEXT,
  extra           JSONB,
  scraped_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scraped_posts (
  id               SERIAL      PRIMARY KEY,
  job_id           TEXT        NOT NULL REFERENCES scraper_jobs(id) ON DELETE CASCADE,
  platform         TEXT        NOT NULL,
  post_url         TEXT,
  post_id          TEXT,
  author_username  TEXT        NOT NULL,
  content          TEXT,
  likes_count      BIGINT      DEFAULT 0,
  comments_count   BIGINT      DEFAULT 0,
  shares_count     BIGINT      DEFAULT 0,
  views_count      BIGINT      DEFAULT 0,
  hashtags         TEXT[]      DEFAULT '{}',
  media_urls       TEXT[]      DEFAULT '{}',
  posted_at        TIMESTAMPTZ,
  extra            JSONB,
  scraped_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_platform   ON scraper_jobs(platform);
CREATE INDEX IF NOT EXISTS idx_jobs_status     ON scraper_jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created    ON scraper_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_lookup ON scraped_profiles(platform, username);
CREATE INDEX IF NOT EXISTS idx_posts_author    ON scraped_posts(platform, author_username);
CREATE INDEX IF NOT EXISTS idx_posts_scraped   ON scraped_posts(scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_hashtags  ON scraped_posts USING GIN(hashtags);
