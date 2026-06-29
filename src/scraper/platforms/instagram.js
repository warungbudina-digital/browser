import { normalizeProfile, normalizePost, isLoginWall } from '../DataExtractor.js';

const PLATFORM = 'instagram';

// ─────────────────────────────────────────────
// Browser-side extraction functions (dijalankan via page.evaluate sebagai string)
// ─────────────────────────────────────────────

const EXTRACT_PROFILE = `() => {
  const meta = (name) =>
    document.querySelector('meta[property="' + name + '"]')?.content ||
    document.querySelector('meta[name="' + name + '"]')?.content || null;

  // Deteksi login wall
  const bodyText = document.body?.innerText || '';
  if (bodyText.includes('Log in to Instagram') || bodyText.includes('You must log in')) {
    return { loginRequired: true };
  }

  const title = meta('og:title') || document.title || '';
  const desc = meta('og:description') || meta('description') || '';
  const image = meta('og:image') || null;

  // "Display Name (@username) • Instagram"
  const displayMatch = title.match(/^(.+?)\\s*\\(@/);
  const username = window.location.pathname.replace(/\\//g, '') || null;

  // "X Followers, Y Following, Z Posts - See Instagram..."
  const parseNum = (m) => m ? parseInt(m[1].replace(/[,. ]/g, ''), 10) : null;
  const followersMatch = desc.match(/([\\d,.]+)\\s*Follower/i);
  const followingMatch = desc.match(/([\\d,.]+)\\s*Following/i);
  const postsMatch     = desc.match(/([\\d,.]+)\\s*Post/i);

  // Bio: Instagram description biasanya "X Followers... - {bio text}"
  const bioMatch = desc.match(/-\\s*(.+)$/s);

  return {
    username,
    displayName: displayMatch?.[1]?.trim() || null,
    bio: bioMatch?.[1]?.trim() || null,
    followersCount: parseNum(followersMatch),
    followingCount: parseNum(followingMatch),
    postsCount:     parseNum(postsMatch),
    avatarUrl: image,
    profileUrl: window.location.href,
    verified: Boolean(document.querySelector('[aria-label*="Verified"]') ||
                      document.querySelector('[class*="verified"]')),
  };
}`;

const EXTRACT_POSTS_GRID = `() => {
  // Grid post links
  const links = Array.from(document.querySelectorAll('a[href*="/p/"]'));
  return links.slice(0, 15).map(a => {
    const img = a.querySelector('img');
    return {
      postUrl: a.href,
      postId: a.href.match(/\\/p\\/([^/]+)/)?.[1] || null,
      thumbnail: img?.src || null,
      altText: img?.alt || null,
    };
  });
}`;

const EXTRACT_POST_DETAIL = `() => {
  const meta = (name) =>
    document.querySelector('meta[property="' + name + '"]')?.content ||
    document.querySelector('meta[name="' + name + '"]')?.content || null;

  const desc = meta('og:description') || '';
  const image = meta('og:image') || null;

  // "X Likes, Y Comments - username on Instagram: caption"
  const parseNum = (m) => m ? parseInt(m[1].replace(/[,. ]/g, ''), 10) : 0;
  const likesMatch    = desc.match(/([\\d,.]+)\\s*Like/i);
  const commentsMatch = desc.match(/([\\d,.]+)\\s*Comment/i);
  const captionMatch  = desc.match(/:\\s*[""](.+)[""]\\s*$/s);

  // Cari tanggal posting dari time element
  const timeEl = document.querySelector('time[datetime]');
  const postedAt = timeEl?.getAttribute('datetime') || null;

  // Kumpulkan semua gambar di post (bisa carousel)
  const images = Array.from(document.querySelectorAll('img[srcset]'))
    .map(img => img.src)
    .filter(src => src && !src.includes('profile'))
    .slice(0, 10);

  return {
    likesCount:    parseNum(likesMatch),
    commentsCount: parseNum(commentsMatch),
    content: captionMatch?.[1]?.trim() || desc,
    mediaUrls: images.length ? images : (image ? [image] : []),
    postedAt,
  };
}`;

// ─────────────────────────────────────────────
// Scraper
// ─────────────────────────────────────────────

export class InstagramScraper {
  async scrape(dispatch, targetUrl, { maxPosts = 6 } = {}) {
    // Navigate ke halaman profil
    await dispatch('navigate', { url: targetUrl });
    await dispatch('act', { request: { kind: 'wait', loadState: 'networkidle', timeoutMs: 20000 } });
    await dispatch('warmup');

    // Extract profile
    const { result: rawProfile } = await dispatch('act', {
      request: { kind: 'evaluate', fn: EXTRACT_PROFILE }
    });

    if (isLoginWall(rawProfile)) {
      throw new Error('Instagram memerlukan login untuk mengakses halaman ini');
    }

    const profile = normalizeProfile(rawProfile, PLATFORM);

    // Extract post URLs dari grid
    const { result: postLinks } = await dispatch('act', {
      request: { kind: 'evaluate', fn: EXTRACT_POSTS_GRID }
    });

    const posts = [];
    for (const link of (postLinks ?? []).slice(0, maxPosts)) {
      try {
        await dispatch('navigate', { url: link.postUrl });
        await dispatch('act', { request: { kind: 'wait', loadState: 'domcontentloaded', timeoutMs: 15000 } });

        const { result: detail } = await dispatch('act', {
          request: { kind: 'evaluate', fn: EXTRACT_POST_DETAIL }
        });

        posts.push(normalizePost({
          ...link, ...detail,
          authorUsername: profile.username,
        }, { platform: PLATFORM, authorUsername: profile.username }));
      } catch {
        // skip post yang gagal, lanjut ke berikutnya
      }

      // Kembali ke halaman profil jika masih ada post yang perlu di-scrape
      if (posts.length < maxPosts && link !== postLinks[postLinks.length - 1]) {
        await dispatch('navigate', { url: targetUrl }).catch(() => {});
      }
    }

    return { profile, posts };
  }
}
