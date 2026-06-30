/**
 * localStorage entry utilities — pure functions, no browser dependency.
 *
 * Entry schema: { key: string, value: string }
 * Entries are fetched via page.evaluate() in BrowserService.
 */

/**
 * Filter entries by key — substring string or RegExp.
 * @param {{ key: string }[]} entries
 * @param {string|RegExp} pattern
 */
export function filterByKey(entries, pattern) {
  if (pattern instanceof RegExp) return entries.filter((e) => pattern.test(e.key));
  return entries.filter((e) => e.key.includes(String(pattern)));
}

/**
 * Filter entries by value — substring string or RegExp.
 * @param {{ value: string }[]} entries
 * @param {string|RegExp} pattern
 */
export function filterByValue(entries, pattern) {
  if (pattern instanceof RegExp) return entries.filter((e) => pattern.test(e.value));
  return entries.filter((e) => e.value.includes(String(pattern)));
}

/**
 * Search entries whose key OR value contains the given text (case-insensitive).
 * @param {{ key: string, value: string }[]} entries
 * @param {string} text
 */
export function search(entries, text) {
  const q = String(text).toLowerCase();
  return entries.filter(
    (e) => e.key.toLowerCase().includes(q) || e.value.toLowerCase().includes(q)
  );
}

/**
 * Convert entries array to a plain object.
 * @param {{ key: string, value: string }[]} entries
 * @returns {Object.<string, string>}
 */
export function toObject(entries) {
  return Object.fromEntries(entries.map((e) => [e.key, e.value]));
}

/**
 * Convert a plain object to entries array.
 * Values are coerced to strings.
 * @param {Object.<string, *>} obj
 * @returns {{ key: string, value: string }[]}
 */
export function fromObject(obj) {
  if (obj == null || typeof obj !== 'object') throw new Error('obj must be a non-null object');
  return Object.entries(obj).map(([key, value]) => ({ key, value: String(value) }));
}

/**
 * Sort entries alphabetically by key.
 * @param {{ key: string }[]} entries
 * @returns {{ key: string }[]}
 */
export function sortByKey(entries) {
  return [...entries].sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Summarize entries.
 * @param {{ key: string, value: string }[]} entries
 * @returns {{ count: number, totalBytes: number, largest: object|null }}
 */
export function summarize(entries) {
  let totalBytes = 0;
  let largest    = null;
  for (const e of entries) {
    const bytes = e.key.length + e.value.length;
    totalBytes += bytes;
    if (!largest || bytes > largest.key.length + largest.value.length) largest = e;
  }
  return { count: entries.length, totalBytes, largest: largest ? { ...largest } : null };
}
