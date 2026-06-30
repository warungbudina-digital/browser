/**
 * IndexedDB entry utilities — pure functions, no browser dependency.
 *
 * Entry schema: { key: *, value: * }
 * Entries are fetched via page.evaluate() in BrowserService.
 */

/**
 * Filter entries by key — substring string or RegExp (key coerced to string).
 * @param {{ key: * }[]} entries
 * @param {string|RegExp} pattern
 */
export function filterByKey(entries, pattern) {
  if (pattern instanceof RegExp) return entries.filter((e) => pattern.test(String(e.key)));
  return entries.filter((e) => String(e.key).includes(String(pattern)));
}

/**
 * Filter object store names by substring string or RegExp.
 * @param {string[]} stores
 * @param {string|RegExp} pattern
 */
export function filterByStore(stores, pattern) {
  if (pattern instanceof RegExp) return stores.filter((s) => pattern.test(s));
  return stores.filter((s) => s.includes(String(pattern)));
}

/**
 * Sort entries alphabetically by key (coerced to string).
 * @param {{ key: * }[]} entries
 */
export function sortByKey(entries) {
  return [...entries].sort((a, b) => String(a.key).localeCompare(String(b.key)));
}

/**
 * Summarize entries — total count and distribution by value type.
 * @param {{ key: *, value: * }[]} entries
 * @returns {{ count: number, types: Object.<string, number> }}
 */
export function summarize(entries) {
  const types = {};
  for (const e of entries) {
    const t = e.value === null ? 'null' : Array.isArray(e.value) ? 'array' : typeof e.value;
    types[t] = (types[t] || 0) + 1;
  }
  return { count: entries.length, types };
}
