import { normalizeProfile, normalizePost } from '../DataExtractor.js';

const PLATFORM = 'tiktok';

// ─────────────────────────────────────────────
// Browser-side extraction functions
// ─────────────────────────────────────────────

const EXTRACT_PROFILE = `() => {
  // TikTok menyimpan SSR data di __NEXT_DATA__ (Next.js)
  const nextDataEl = document.getElementById('__NEXT_DATA__');
  if (nextDataEl) {
    try {
      const data = JSON.parse(nextDataEl.textContent);
      const userInfo = data?.props?.pageProps?.userInfo;
      if (userInfo?.user) {
        const u = userInfo.user;
        const s = userInfo.stats || {};
        return {
          username:       u.uniqueId,
          displayName:    u.nickname,
          bio:            u.signature || null,
          avatarUrl:      u.avatarLarger || u.avatarMedium || null,
          verified:       Boolean(u.verified),
          followersCount: s.followerCount ?? null,
          followingCount: s.followingCount ?? null,
          postsCount:     s.videoCount ?? null,
          extra:          { heartCount: s.heart ?? null, diggCount: s.diggCount ?? null },
          profileUrl:     window.location.href,
        };
      }
    } catch {}
  }

  // Fallback: meta tags
  const meta = (name) =>
    document.querySelector('meta[property="' + name + '"]')?.content ||
    document.querySelector('meta[name="' + name + '"]')?.content || null;

  const username = window.location.pathname.replace('/@', '').split('?')[0] || null;
  const title = meta('og:title') || '';
  const desc  = meta('og:description') || '';

  return {
    username,
    displayName: title.split('(')[0].trim() || null,
    bio: desc || null,
    avatarUrl: meta('og:image'),
    verified: false,
    followersCount: null,
    followingCount: null,
    postsCount: null,
    profileUrl: window.location.href,
  };
}`;

const EXTRACT_VIDEOS = `() => {
  // Coba dari NEXT_DATA dulu (lebih lengkap)
  const nextDataEl = document.getElementById('__NEXT_DATA__');
  if (nextDataEl) {
    try {
      const data = JSON.parse(nextDataEl.textContent);
      const items = data?.props?.pageProps?.itemList || [];
      return items.slice(0, 15).map(v => ({
        postId:        v.id || null,
        postUrl:       'https://www.tiktok.com/@' + (v.author?.uniqueId || '') + '/video/' + v.id,
        content:       v.desc || null,
        likesCount:    v.stats?.diggCount ?? 0,
        commentsCount: v.stats?.commentCount ?? 0,
        sharesCount:   v.stats?.shareCount ?? 0,
        viewsCount:    v.stats?.playCount ?? 0,
        mediaUrls:     v.video?.cover ? [v.video.cover] : [],
        postedAt:      v.createTime ? new Date(v.createTime * 1000).toISOString() : null,
      }));
    } catch {}
  }

  // Fallback: scrape visible video cards dari DOM
  const cards = Array.from(document.querySelectorAll('[data-e2e="user-post-item"]'));
  return cards.slice(0, 15).map(card => {
    const a = card.querySelector('a');
    const img = card.querySelector('img');
    const views = card.querySelector('[data-e2e="video-views"]')?.textContent?.trim() || '0';
    return {
      postId:     a?.href?.match(/video\\/([\\d]+)/)?.[1] || null,
      postUrl:    a?.href || null,
      content:    img?.alt || null,
      viewsCount: views,
      likesCount: 0, commentsCount: 0, sharesCount: 0,
      mediaUrls:  img?.src ? [img.src] : [],
      postedAt:   null,
    };
  });
}`;

// ─────────────────────────────────────────────
// Scraper
// ─────────────────────────────────────────────

export class TikTokScraper {
  async scrape(dispatch, targetUrl) {
    // Format URL: https://www.tiktok.com/@username
    const normalized = targetUrl.includes('tiktok.com') ? targetUrl
      : `https://www.tiktok.com/@${targetUrl.replace(/^@/, '')}`;

    await dispatch('navigate', { url: normalized });
    await dispatch('act', { request: { kind: 'wait', loadState: 'networkidle', timeoutMs: 20000 } });
    await dispatch('warmup');

    const { result: rawProfile } = await dispatch('act', {
      request: { kind: 'evaluate', fn: EXTRACT_PROFILE }
    });

    const profile = normalizeProfile(rawProfile, PLATFORM);

    const { result: rawVideos } = await dispatch('act', {
      request: { kind: 'evaluate', fn: EXTRACT_VIDEOS }
    });

    const posts = (rawVideos ?? []).map((v) =>
      normalizePost({ ...v, authorUsername: profile.username }, {
        platform: PLATFORM,
        authorUsername: profile.username
      })
    );

    return { profile, posts };
  }
}
