/**
 * Navigation history filter utilities — pure functions, no browser dependency.
 *
 * Entry schema: { url: string, title: string, at: ISO }
 * Captured on every main-frame navigation via page.on('framenavigated').
 */

/**
 * Filter entries by URL — substring string or RegExp.
 * @param {{ url: string }[]} entries
 * @param {string|RegExp} pattern
 */
export function filterByUrl(entries, pattern) {
  if (pattern instanceof RegExp) return entries.filter((e) => pattern.test(e.url));
  return entries.filter((e) => e.url.includes(String(pattern)));
}

/**
 * Filter entries by page title — substring string or RegExp.
 * @param {{ title: string }[]} entries
 * @param {string|RegExp} pattern
 */
export function filterByTitle(entries, pattern) {
  if (pattern instanceof RegExp) return entries.filter((e) => pattern.test(e.title));
  const q = String(pattern).toLowerCase();
  return entries.filter((e) => e.title.toLowerCase().includes(q));
}

/**
 * Keep only entries at or after the given ISO timestamp.
 * @param {{ at: string }[]} entries
 * @param {string} iso
 */
export function filterSince(entries, iso) {
  const ts = new Date(iso).getTime();
  return entries.filter((e) => new Date(e.at).getTime() >= ts);
}

/**
 * Keep only entries strictly before the given ISO timestamp.
 * @param {{ at: string }[]} entries
 * @param {string} iso
 */
export function filterBefore(entries, iso) {
  const ts = new Date(iso).getTime();
  return entries.filter((e) => new Date(e.at).getTime() < ts);
}

/**
 * Return deduplicated entries — consecutive duplicate URLs are collapsed.
 * @param {{ url: string }[]} entries
 * @returns {{ url: string }[]}
 */
export function deduplicateConsecutive(entries) {
  return entries.filter((e, i) => i === 0 || e.url !== entries[i - 1].url);
}

/**
 * Group entries by URL (all visits to each URL).
 * @param {{ url: string }[]} entries
 * @returns {Object.<string, object[]>}
 */
export function groupByUrl(entries) {
  const groups = {};
  for (const entry of entries) {
    if (!groups[entry.url]) groups[entry.url] = [];
    groups[entry.url].push(entry);
  }
  return groups;
}

/**
 * Summarize navigation history.
 * @param {{ url: string, title: string, at: string }[]} entries
 * @returns {{ total, uniqueUrls: string[], first, last }}
 */
export function summarize(entries) {
  const uniqueUrls = [...new Set(entries.map((e) => e.url))];
  return {
    total:      entries.length,
    uniqueUrls,
    first:      entries.length > 0 ? entries[0]                   : null,
    last:       entries.length > 0 ? entries[entries.length - 1]  : null,
  };
}

/**
 * Format entries as human-readable text.
 * @param {{ url: string, title: string, at: string }[]} entries
 * @param {{ timestamps?: boolean }} opts
 */
export function formatText(entries, { timestamps = false } = {}) {
  return entries.map((e) => {
    const label = e.title ? `${e.title} — ${e.url}` : e.url;
    if (timestamps) {
      const t   = new Date(e.at);
      const hms = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}`;
      return `[${hms}] ${label}`;
    }
    return label;
  }).join('\n');
}
