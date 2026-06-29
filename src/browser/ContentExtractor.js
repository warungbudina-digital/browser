// ─────────────────────────────────────────────────────────────────────────────
// DOM collector functions — each runs inside page.evaluate() in browser context
// Must be self-contained (no external closures).
// ─────────────────────────────────────────────────────────────────────────────

export function textCollector() {
  const sections = [];
  const captured = new WeakSet();

  document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,ul,ol,table,blockquote,pre').forEach((el) => {
    // Skip if a parent was already captured (avoids double-capturing nested elements)
    let anc = el.parentElement;
    while (anc) {
      if (captured.has(anc)) return;
      anc = anc.parentElement;
    }
    captured.add(el);

    const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text) return;
    const tag = el.tagName.toLowerCase();

    if (/^h[1-6]$/.test(tag)) {
      sections.push({ type: 'heading', level: parseInt(tag[1], 10), text });
    } else if (tag === 'p') {
      if (text.length >= 5) sections.push({ type: 'paragraph', text });
    } else if (tag === 'ul' || tag === 'ol') {
      const items = Array.from(el.querySelectorAll('li'))
        .map((li) => (li.innerText || li.textContent || '').replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      if (items.length) sections.push({ type: 'list', ordered: tag === 'ol', items });
    } else if (tag === 'table') {
      const rows = Array.from(el.querySelectorAll('tr'))
        .map((tr) =>
          Array.from(tr.querySelectorAll('th,td'))
            .map((cell) => (cell.innerText || cell.textContent || '').replace(/\s+/g, ' ').trim())
        )
        .filter((r) => r.length && r.some((c) => c));
      if (rows.length) sections.push({ type: 'table', rows });
    } else if (tag === 'blockquote') {
      sections.push({ type: 'quote', text });
    } else if (tag === 'pre') {
      sections.push({ type: 'code', text });
    }
  });

  return sections;
}

export function metaCollector() {
  function getMeta(name) {
    const el = document.querySelector(
      `meta[name="${CSS.escape(name)}"], meta[property="${CSS.escape(name)}"]`
    );
    return el ? (el.getAttribute('content') || '') : '';
  }
  const jsonLd = Array.from(
    document.querySelectorAll('script[type="application/ld+json"]')
  ).map((s) => { try { return JSON.parse(s.textContent); } catch { return null; } })
    .filter(Boolean);

  return {
    title:              document.title || '',
    description:        getMeta('description') || getMeta('og:description'),
    canonical:          (document.querySelector('link[rel="canonical"]') || {}).href || '',
    ogTitle:            getMeta('og:title'),
    ogDescription:      getMeta('og:description'),
    ogImage:            getMeta('og:image'),
    ogType:             getMeta('og:type'),
    twitterCard:        getMeta('twitter:card'),
    twitterTitle:       getMeta('twitter:title'),
    twitterDescription: getMeta('twitter:description'),
    twitterImage:       getMeta('twitter:image'),
    keywords:           getMeta('keywords'),
    robots:             getMeta('robots'),
    author:             getMeta('author'),
    jsonLd,
  };
}

export function linksCollector() {
  return Array.from(document.querySelectorAll('a[href]'))
    .map((a) => ({
      text: (a.innerText || a.textContent || '').replace(/\s+/g, ' ').trim()
            || a.getAttribute('aria-label') || '',
      href: a.href || '',
      rel:  a.getAttribute('rel') || '',
    }))
    .filter((l) => l.href && !l.href.startsWith('javascript:'));
}

// ─────────────────────────────────────────────────────────────────────────────
// Node.js-side processors (pure, no DOM dependency — fully unit-testable)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert raw sections from textCollector() into a structured content object.
 * @param {object[]} sections
 * @returns {{ sections, text, headings, stats }}
 */
export function buildTextContent(sections) {
  if (!Array.isArray(sections)) return { sections: [], text: '', headings: [], stats: { sections: 0, headings: 0, paragraphs: 0, lists: 0, tables: 0 } };

  const valid = sections.filter((s) => s && s.type);
  const textParts = [];

  for (const s of valid) {
    if (s.type === 'heading') {
      textParts.push(`${'#'.repeat(s.level)} ${s.text}`);
    } else if (s.type === 'paragraph') {
      textParts.push(s.text);
    } else if (s.type === 'list') {
      const lines = s.items.map((item, i) => (s.ordered ? `${i + 1}. ` : '- ') + item);
      textParts.push(lines.join('\n'));
    } else if (s.type === 'table') {
      textParts.push(s.rows.map((row) => row.join(' | ')).join('\n'));
    } else if (s.type === 'quote') {
      textParts.push(`> ${s.text}`);
    } else if (s.type === 'code') {
      textParts.push(`\`\`\`\n${s.text}\n\`\`\``);
    }
  }

  return {
    sections: valid,
    text: textParts.join('\n\n'),
    headings: valid.filter((s) => s.type === 'heading'),
    stats: {
      sections:   valid.length,
      headings:   valid.filter((s) => s.type === 'heading').length,
      paragraphs: valid.filter((s) => s.type === 'paragraph').length,
      lists:      valid.filter((s) => s.type === 'list').length,
      tables:     valid.filter((s) => s.type === 'table').length,
    },
  };
}

/**
 * Normalize raw metadata from metaCollector().
 * @param {object} raw
 * @returns {object}
 */
export function buildMetadata(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      title: '', description: '', canonical: '',
      ogTitle: '', ogDescription: '', ogImage: '', ogType: '',
      twitterCard: '', twitterTitle: '', twitterDescription: '', twitterImage: '',
      keywords: '', robots: '', author: '', jsonLd: [],
    };
  }
  return {
    title:              String(raw.title              ?? ''),
    description:        String(raw.description        ?? ''),
    canonical:          String(raw.canonical          ?? ''),
    ogTitle:            String(raw.ogTitle            ?? ''),
    ogDescription:      String(raw.ogDescription      ?? ''),
    ogImage:            String(raw.ogImage            ?? ''),
    ogType:             String(raw.ogType             ?? ''),
    twitterCard:        String(raw.twitterCard        ?? ''),
    twitterTitle:       String(raw.twitterTitle       ?? ''),
    twitterDescription: String(raw.twitterDescription ?? ''),
    twitterImage:       String(raw.twitterImage       ?? ''),
    keywords:           String(raw.keywords           ?? ''),
    robots:             String(raw.robots             ?? ''),
    author:             String(raw.author             ?? ''),
    jsonLd:             Array.isArray(raw.jsonLd) ? raw.jsonLd : [],
  };
}

/**
 * Process raw links from linksCollector(), dedup by href, classify internal/external.
 * @param {object[]} rawLinks
 * @param {string|null} baseUrl — used to classify internal vs external
 * @returns {{ links, stats }}
 */
export function buildLinks(rawLinks, baseUrl = null) {
  if (!Array.isArray(rawLinks)) {
    return { links: [], stats: { total: 0, internal: 0, external: 0 } };
  }

  let baseHostname = null;
  try {
    if (baseUrl) baseHostname = new URL(baseUrl).hostname;
  } catch { /* ignore invalid baseUrl */ }

  const seen = new Set();
  const links = [];

  for (const raw of rawLinks) {
    const href = String(raw.href || '').trim();
    if (!href || href.startsWith('javascript:') || seen.has(href)) continue;
    seen.add(href);

    let isExternal = null;
    try {
      const u = new URL(href);
      if (baseHostname) isExternal = u.hostname !== baseHostname;
    } catch { /* relative or malformed — leave isExternal null */ }

    links.push({
      text:       String(raw.text || '').trim(),
      href,
      rel:        String(raw.rel || '').trim(),
      isExternal,
    });
  }

  const internal = links.filter((l) => l.isExternal === false).length;
  const external = links.filter((l) => l.isExternal === true).length;

  return {
    links,
    stats: { total: links.length, internal, external },
  };
}

/**
 * Truncate text to at most maxChars characters, breaking at a word boundary.
 * @param {string} text
 * @param {number} maxChars
 * @returns {string}
 */
export function summarize(text, maxChars = 500) {
  if (!text || typeof text !== 'string') return '';
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  const cut = trimmed.lastIndexOf(' ', maxChars - 3);
  return (cut > 0 ? trimmed.slice(0, cut) : trimmed.slice(0, maxChars - 3)) + '...';
}
