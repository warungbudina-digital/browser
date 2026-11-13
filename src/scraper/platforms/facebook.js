import { normalizeProfile, normalizePost, isLoginWall, extractProfileWithRetry } from '../DataExtractor.js';

const PLATFORM = 'facebook';

// ─────────────────────────────────────────────
// Browser-side extraction functions
// ─────────────────────────────────────────────

const EXTRACT_PROFILE = `() => {
  const meta = (name) =>
    document.querySelector('meta[property="' + name + '"]')?.content ||
    document.querySelector('meta[name="' + name + '"]')?.content || null;

  const bodyText = document.body?.innerText || '';
  const loginIndicators = [
    'You must log in to continue', 'Masuk ke Facebook', 'Log Into Facebook',
    'You must log in to see', 'Anda harus masuk',
  ];
  if (loginIndicators.some((s) => bodyText.includes(s))) {
    return { loginRequired: true };
  }

  const title = meta('og:title') || document.title.replace(/\\s*\\|\\s*Facebook\\s*$/, '') || '';
  const desc  = meta('og:description') || '';
  const image = meta('og:image') || null;

  const username = window.location.pathname.replace(/^\\/|\\/$/g, '').split('/')[0] || null;

  // "123 pengikut" / "123 followers" / "123 orang menyukai ini" / "123 likes"
  const parseNum = (m) => {
    if (!m) return null;
    const clean = m[1].replace(/[.,]/g, '').trim();
    const n = parseFloat(clean);
    return Number.isFinite(n) ? Math.round(n) : null;
  };
  const followersMatch = bodyText.match(/([\\d.,]+)\\s*(pengikut|followers)/i);
  const likesMatch      = bodyText.match(/([\\d.,]+)\\s*(orang menyukai ini|people like this|suka)/i);

  return {
    username,
    displayName: title.trim() || null,
    bio: desc.trim() || null,
    followersCount: parseNum(followersMatch) ?? parseNum(likesMatch),
    followingCount: null,
    postsCount: null,
    avatarUrl: image,
    profileUrl: window.location.href,
    verified: Boolean(document.querySelector('[aria-label*="Verified"]') ||
                      document.querySelector('[aria-label*="Terverifikasi"]')),
  };
}`;

const EXTRACT_POSTS = `() => {
  const articles = Array.from(document.querySelectorAll('[role="article"]'));
  return articles.slice(0, 15).map((el) => {
    const permalink = el.querySelector('a[href*="/posts/"], a[href*="/videos/"], a[href*="/photos/"], a[href*="/reel/"]');
    const text = el.innerText || '';

    const parseNum = (m) => {
      if (!m) return 0;
      const clean = m[1].replace(/[.,]/g, '');
      const mult = clean.endsWith('K') ? 1000 : clean.endsWith('M') ? 1000000 : 1;
      const n = parseFloat(clean);
      return Number.isFinite(n) ? Math.round(n * mult) : 0;
    };
    const likesMatch    = text.match(/([\\d.,]+K?)\\s*(Like|Suka)/i);
    const commentsMatch = text.match(/([\\d.,]+K?)\\s*(Comment|Komentar)/i);
    const sharesMatch   = text.match(/([\\d.,]+K?)\\s*(Share|Bagikan)/i);

    const imgEls = Array.from(el.querySelectorAll('img')).filter(
      (img) => img.src && !img.src.includes('emoji') && img.naturalWidth > 60
    );

    return {
      postUrl: permalink?.href || null,
      postId: permalink?.href?.match(/\\/(posts|videos|photos|reel)\\/([^/?]+)/)?.[2] || null,
      content: text.slice(0, 2000) || null,
      likesCount: parseNum(likesMatch),
      commentsCount: parseNum(commentsMatch),
      sharesCount: parseNum(sharesMatch),
      viewsCount: 0,
      mediaUrls: imgEls.map((img) => img.src).slice(0, 10),
      postedAt: null,
    };
  }).filter((p) => p.postUrl || p.content);
}`;

// ─────────────────────────────────────────────
// Scraper
// ─────────────────────────────────────────────

export class FacebookScraper {
  async scrape(dispatch, targetUrl) {
    await dispatch('navigate', { url: targetUrl });
    await dispatch('act', { request: { kind: 'wait', loadState: 'networkidle', timeoutMs: 25000 } });
    await dispatch('warmup');

    const rawProfile = await extractProfileWithRetry(dispatch, targetUrl, EXTRACT_PROFILE);

    if (isLoginWall(rawProfile)) {
      throw new Error('Facebook memerlukan login untuk mengakses halaman ini');
    }
    if (!rawProfile?.username) {
      throw new Error('Gagal mengekstrak profil Facebook (kemungkinan redirect/struktur halaman berubah) -- targetUrl=' + targetUrl);
    }

    const profile = normalizeProfile(rawProfile, PLATFORM);

    const { result: rawPosts } = await dispatch('act', {
      request: { kind: 'evaluate', fn: EXTRACT_POSTS }
    });

    const posts = (rawPosts ?? []).map((p) =>
      normalizePost({ ...p, authorUsername: profile.username }, {
        platform: PLATFORM,
        authorUsername: profile.username
      })
    );

    return { profile, posts };
  }
}
