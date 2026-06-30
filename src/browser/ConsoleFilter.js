/**
 * Console log filter utilities — pure, no browser dependency.
 *
 * Log entry shape (from BrowserService):
 *   { level: string, text: string, at: ISO-8601 string }
 *
 * Level values come from Playwright's message.type():
 *   'log' | 'info' | 'warn' | 'error' | 'debug' | 'verbose' | ...
 */

/** Standard console levels used for validation and grouping defaults. */
export const VALID_LEVELS = new Set(['log', 'info', 'warn', 'error', 'debug']);

/**
 * Filter entries by level.
 * @param {object[]}        entries
 * @param {string|string[]} level   Single level or array of levels.
 * @returns {object[]} shallow copies
 */
export function filterByLevel(entries, level) {
  const levels = Array.isArray(level) ? level : [level];
  return entries.filter((e) => levels.includes(e.level)).map((e) => ({ ...e }));
}

/**
 * Filter entries whose text matches a pattern.
 * String → substring match; RegExp → test against text.
 * @param {object[]}      entries
 * @param {string|RegExp} pattern
 * @returns {object[]} shallow copies
 */
export function filterByPattern(entries, pattern) {
  if (pattern instanceof RegExp) return entries.filter((e) => pattern.test(e.text)).map((e) => ({ ...e }));
  return entries.filter((e) => e.text.includes(String(pattern))).map((e) => ({ ...e }));
}

/**
 * Filter entries at or after the given ISO timestamp.
 * @param {object[]} entries
 * @param {string}   since   ISO-8601 string
 * @returns {object[]} shallow copies
 */
export function filterSince(entries, since) {
  const s = String(since);
  return entries.filter((e) => e.at >= s).map((e) => ({ ...e }));
}

/**
 * Filter entries strictly before the given ISO timestamp.
 * @param {object[]} entries
 * @param {string}   before  ISO-8601 string
 * @returns {object[]} shallow copies
 */
export function filterBefore(entries, before) {
  const b = String(before);
  return entries.filter((e) => e.at < b).map((e) => ({ ...e }));
}

/**
 * Group entries by their level field.
 * @param {object[]} entries
 * @returns {Object.<string, object[]>}
 */
export function groupByLevel(entries) {
  const groups = {};
  for (const e of entries) {
    if (!groups[e.level]) groups[e.level] = [];
    groups[e.level].push({ ...e });
  }
  return groups;
}

/**
 * Aggregate stats for a set of log entries.
 * @param {object[]} entries
 * @returns {{ total: number, byLevel: Object.<string,number>, first: string|null, last: string|null }}
 */
export function summarize(entries) {
  const byLevel = {};
  let first = null;
  let last  = null;
  for (const e of entries) {
    byLevel[e.level] = (byLevel[e.level] || 0) + 1;
    if (first === null || e.at < first) first = e.at;
    if (last  === null || e.at > last)  last  = e.at;
  }
  return { total: entries.length, byLevel, first, last };
}

/**
 * Format entries as a plain-text log string.
 * Each line: `[LEVEL] text` or `[LEVEL HH:MM:SS] text` if timestamps=true.
 * @param {object[]} entries
 * @param {{ timestamps?: boolean }} [opts]
 * @returns {string}
 */
export function formatText(entries, { timestamps = false } = {}) {
  return entries.map((e) => {
    const level = String(e.level || '').toUpperCase().padEnd(5);
    if (timestamps) {
      const time = e.at ? String(e.at).slice(11, 19) : '??:??:??';
      return `[${level} ${time}] ${e.text}`;
    }
    return `[${level}] ${e.text}`;
  }).join('\n');
}
