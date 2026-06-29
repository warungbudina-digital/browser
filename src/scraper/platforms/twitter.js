import { normalizeProfile, normalizePost } from '../DataExtractor.js';

const PLATFORM = 'twitter';

// ─────────────────────────────────────────────
// Browser-side extraction functions
// ─────────────────────────────────────────────

const EXTRACT_PROFILE = `() => {
  const meta = (name) =>
    document.querySelector('meta[property="' + name + '"]')?.content ||
    document.querySelector('meta[name="' + name + '"]')?.content || null;

  const username = window.location.pathname.replace('/', '').split('/')[0] || null;
  const title    = meta('og:title') || document.title || '';
  const desc     = meta('og:description') || '';
  const image    = meta('og:image') || null;

  // Coba extract dari React hydration (Twitter/X)
  // Twitter menyimpan state di window.__INITIAL_STATE__ atau redux store
  const initState = window?.__INITIAL_STATE__;
  if (initState) {
    try {
      const entities = initState?.entities?.users?.entities;
      if (entities) {
        const user = Object.values(entities).find(
          u => u.screen_name?.toLowerCase() === username?.toLowerCase()
        );
        if (user) {
          return {
            username:       user.screen_name,
            displayName:    user.name,
            bio:            user.description,
            followersCount: user.followers_count,
            followingCount: user.friends_count,
            postsCount:     user.statuses_count,
            verified:       Boolean(user.verified || user.is_blue_verified),
            avatarUrl:      user.profile_image_url_https?.replace('_normal', '_400x400'),
            profileUrl:     window.location.href,
          };
        }
      }
    } catch {}
  }

  // Fallback: DOM parsing (React-rendered)
  const parseFollowers = (text) => {
    if (!text) return null;
    const clean = text.replace(/[,]/g, '');
    const mult = clean.includes('K') ? 1000 : clean.includes('M') ? 1000000 : 1;
    const n = parseFloat(clean);
    return Number.isFinite(n) ? Math.round(n * mult) : null;
  };

  // Twitter/X stats dalam span berurutan
  const statLinks = Array.from(document.querySelectorAll('a[href$="/following"], a[href$="/followers"]'));
  let followingCount = null, followersCount = null;
  for (const link of statLinks) {
    const num = link.querySelector('span')?.textContent;
    if (link.href.endsWith('/following')) followingCount = parseFollowers(num);
    if (link.href.endsWith('/followers')) followersCount = parseFollowers(num);
  }

  // Display name dari h1/h2
  const displayName = document.querySelector('[data-testid="UserName"] span')?.textContent
    || title.split('(')[0].trim() || null;

  // Bio dari description element
  const bio = document.querySelector('[data-testid="UserDescription"]')?.textContent
    || desc || null;

  return {
    username,
    displayName,
    bio,
    followersCount,
    followingCount,
    postsCount: null,
    verified: Boolean(document.querySelector('[data-testid="icon-verified"]') ||
                      document.querySelector('[aria-label*="Verified"]')),
    avatarUrl: image,
    profileUrl: window.location.href,
  };
}`;

const EXTRACT_TWEETS = `() => {
  const tweets = Array.from(document.querySelectorAll('[data-testid="tweet"]'));
  return tweets.slice(0, 15).map(tw => {
    const textEl    = tw.querySelector('[data-testid="tweetText"]');
    const timeEl    = tw.querySelector('time');
    const likeEl    = tw.querySelector('[data-testid="like"] span');
    const replyEl   = tw.querySelector('[data-testid="reply"] span');
    const rtEl      = tw.querySelector('[data-testid="retweet"] span');
    const linkEl    = tw.querySelector('a[href*="/status/"]');
    const imgEls    = Array.from(tw.querySelectorAll('img[src*="pbs.twimg.com"]'));

    const parseNum = (el) => {
      if (!el) return 0;
      const t = el.textContent.trim();
      const mult = t.endsWith('K') ? 1000 : t.endsWith('M') ? 1000000 : 1;
      const n = parseFloat(t);
      return Number.isFinite(n) ? Math.round(n * mult) : 0;
    };

    const href = linkEl?.href || null;
    return {
      postId:        href?.match(/status\\/(\\d+)/)?.[1] || null,
      postUrl:       href,
      content:       textEl?.textContent?.trim() || null,
      likesCount:    parseNum(likeEl),
      commentsCount: parseNum(replyEl),
      sharesCount:   parseNum(rtEl),
      viewsCount:    0,
      mediaUrls:     imgEls.map(img => img.src).filter(Boolean),
      postedAt:      timeEl?.getAttribute('datetime') || null,
    };
  });
}`;

// ─────────────────────────────────────────────
// Scraper
// ─────────────────────────────────────────────

export class TwitterScraper {
  async scrape(dispatch, targetUrl) {
    const normalized = targetUrl.includes('twitter.com') || targetUrl.includes('x.com')
      ? targetUrl
      : `https://twitter.com/${targetUrl.replace(/^@/, '')}`;

    await dispatch('navigate', { url: normalized });
    await dispatch('act', { request: { kind: 'wait', loadState: 'networkidle', timeoutMs: 25000 } });
    await dispatch('warmup');

    const { result: rawProfile } = await dispatch('act', {
      request: { kind: 'evaluate', fn: EXTRACT_PROFILE }
    });

    const profile = normalizeProfile(rawProfile, PLATFORM);

    const { result: rawTweets } = await dispatch('act', {
      request: { kind: 'evaluate', fn: EXTRACT_TWEETS }
    });

    const posts = (rawTweets ?? []).map((t) =>
      normalizePost({ ...t, authorUsername: profile.username }, {
        platform: PLATFORM,
        authorUsername: profile.username
      })
    );

    return { profile, posts };
  }
}
