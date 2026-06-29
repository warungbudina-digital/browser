/**
 * Utility parsing yang dipakai oleh semua platform scraper.
 * Berjalan di Node.js context (bukan browser), menerima data yang sudah di-extract
 * dari browser via page.evaluate.
 */

/** Parse angka dari string dengan koma: "1,234" → 1234, "10.5K" → 10500 */
export function parseCount(raw) {
  if (raw == null) return null;
  const s = String(raw).replace(/,/g, '').trim();
  if (!s || s === '-') return null;
  const mult = s.endsWith('K') ? 1e3 : s.endsWith('M') ? 1e6 : s.endsWith('B') ? 1e9 : 1;
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * mult) : null;
}

/** Extract hashtags dari teks caption */
export function extractHashtags(text) {
  if (!text) return [];
  return [...new Set((text.match(/#[\w-￿]+/g) ?? []).map((h) => h.toLowerCase()))];
}

/** Deteksi apakah halaman adalah login wall */
export function isLoginWall(result) {
  if (!result) return false;
  const indicators = ['loginRequired', 'isLoginWall', 'blocked'];
  return indicators.some((k) => result[k] === true);
}

/** Normalize profile data — isi field yang hilang dengan null */
export function normalizeProfile(raw, platform) {
  return {
    username: raw?.username ?? null,
    displayName: raw?.displayName ?? null,
    bio: raw?.bio ?? null,
    followersCount: parseCount(raw?.followersCount),
    followingCount: parseCount(raw?.followingCount),
    postsCount: parseCount(raw?.postsCount),
    verified: Boolean(raw?.verified),
    profileUrl: raw?.profileUrl ?? null,
    avatarUrl: raw?.avatarUrl ?? null,
    extra: raw?.extra ?? null,
    platform,
  };
}

/** Normalize post data */
export function normalizePost(raw, { platform, authorUsername }) {
  return {
    postUrl: raw?.postUrl ?? null,
    postId: raw?.postId ?? null,
    authorUsername: raw?.authorUsername ?? authorUsername,
    content: raw?.content ?? null,
    likesCount: parseCount(raw?.likesCount) ?? 0,
    commentsCount: parseCount(raw?.commentsCount) ?? 0,
    sharesCount: parseCount(raw?.sharesCount) ?? 0,
    viewsCount: parseCount(raw?.viewsCount) ?? 0,
    hashtags: extractHashtags(raw?.content ?? raw?.hashtags?.join(' ')),
    mediaUrls: Array.isArray(raw?.mediaUrls) ? raw.mediaUrls : [],
    postedAt: raw?.postedAt ?? null,
    extra: raw?.extra ?? null,
    platform,
  };
}
