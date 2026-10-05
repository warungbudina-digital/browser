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


// ─────────────────────────────────────────────────────────────────────────────
// Node-side HTML parsers (dari CDP DOM.getOuterHTML / page.content()).
// Dipakai extract() sbg ganti page.evaluate collectors yg TAK stabil di
// patchright+connectOverCDP (patchright hindari Runtime.enable). Bentuk `raw`
// yg dikembalikan SAMA dgn collector -> build* tetap dipakai apa adanya.
// ─────────────────────────────────────────────────────────────────────────────
export function decodeEntities(x) {
  if (!x) return '';
  return String(x)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(+n); } catch { return ''; } })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => { try { return String.fromCodePoint(parseInt(n, 16)); } catch { return ''; } });
}
export function stripTags(x) {
  return decodeEntities(String(x || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}
function htmlAttr(tag, name) {
  const m = tag.match(new RegExp(name + '\\s*=\\s*"([^"]*)"', 'i'))
         || tag.match(new RegExp(name + "\\s*=\\s*'([^']*)'", 'i'));
  return m ? m[1] : '';
}

export function parseMetaFromHtml(html) {
  html = String(html || '');
  const head = (html.match(/<head[\s\S]*?<\/head>/i) || [html])[0];
  const map = {};
  for (const tag of head.match(/<meta\s[^>]*>/gi) || []) {
    const k = (htmlAttr(tag, 'name') || htmlAttr(tag, 'property')).toLowerCase();
    if (k) map[k] = decodeEntities(htmlAttr(tag, 'content'));
  }
  const g = (k) => map[k] || '';
  const title = decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || ['', ''])[1]).trim();
  const canonicalTag = (head.match(/<link[^>]+rel\s*=\s*["']canonical["'][^>]*>/i) || [''])[0];
  const jsonLd = [];
  const ldRe = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let mm;
  while ((mm = ldRe.exec(html))) { try { jsonLd.push(JSON.parse(mm[1].trim())); } catch { /* skip */ } }
  return {
    title,
    description: g('description') || g('og:description'),
    canonical: htmlAttr(canonicalTag, 'href'),
    ogTitle: g('og:title'), ogDescription: g('og:description'), ogImage: g('og:image'), ogType: g('og:type'),
    twitterCard: g('twitter:card'), twitterTitle: g('twitter:title'),
    twitterDescription: g('twitter:description'), twitterImage: g('twitter:image'),
    keywords: g('keywords'), robots: g('robots'), author: g('author'), jsonLd,
  };
}

export function parseLinksFromHtml(html, baseUrl) {
  const out = [];
  const re = /<a\s[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(String(html || '')))) {
    let href = m[1];
    if (/^\s*javascript:/i.test(href)) continue;
    try { href = new URL(href, baseUrl).href; } catch { /* keep raw */ }
    out.push({ text: stripTags(m[2]) || htmlAttr(m[0], 'aria-label'), href, rel: htmlAttr(m[0], 'rel') });
  }
  return out;
}

export function parseTextFromHtml(html) {
  const body = (String(html || '').match(/<body[\s\S]*?<\/body>/i) || [String(html || '')])[0]
    .replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1>/gi, ' ');
  const sections = [];
  const re = /<(h[1-6]|p|ul|ol|table|blockquote|pre)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(body))) {
    const tag = m[1].toLowerCase(); const inner = m[2];
    if (/^h[1-6]$/.test(tag)) { const t = stripTags(inner); if (t) sections.push({ type: 'heading', level: +tag[1], text: t }); }
    else if (tag === 'p') { const t = stripTags(inner); if (t.length >= 5) sections.push({ type: 'paragraph', text: t }); }
    else if (tag === 'ul' || tag === 'ol') {
      const items = (inner.match(/<li\b[^>]*>([\s\S]*?)<\/li>/gi) || [])
        .map((li) => stripTags(li.replace(/^<li\b[^>]*>/i, '').replace(/<\/li>\s*$/i, ''))).filter(Boolean);
      if (items.length) sections.push({ type: 'list', ordered: tag === 'ol', items });
    } else if (tag === 'table') {
      const rows = (inner.match(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi) || []).map((tr) =>
        (tr.match(/<(th|td)\b[^>]*>([\s\S]*?)<\/(th|td)>/gi) || [])
          .map((c) => stripTags(c.replace(/^<(th|td)\b[^>]*>/i, '').replace(/<\/(th|td)>\s*$/i, '')))
      ).filter((r) => r.length && r.some(Boolean));
      if (rows.length) sections.push({ type: 'table', rows });
    } else if (tag === 'blockquote') { const t = stripTags(inner); if (t) sections.push({ type: 'quote', text: t }); }
    else if (tag === 'pre') { const t = stripTags(inner); if (t) sections.push({ type: 'code', text: t }); }
  }
  return sections;
}
