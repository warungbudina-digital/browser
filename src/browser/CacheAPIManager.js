/**
 * Cache API utilities — pure functions, no browser dependency.
 *
 * cacheMap schema: { [cacheName: string]: string[] (URLs) }
 * entry schema:    { url: string, status: number, headers: Record<string,string> }
 */

/**
 * Filter cache names by substring or RegExp.
 * @param {string[]} names
 * @param {string|RegExp} pattern
 */
export function filterByName(names, pattern) {
  if (pattern instanceof RegExp) return names.filter((n) => pattern.test(n));
  return names.filter((n) => n.includes(String(pattern)));
}

/**
 * Filter cached entries by their URL (substring or RegExp).
 * @param {{ url: string }[]} entries
 * @param {string|RegExp} pattern
 */
export function filterByUrl(entries, pattern) {
  if (pattern instanceof RegExp) return entries.filter((e) => pattern.test(e.url));
  return entries.filter((e) => e.url.includes(String(pattern)));
}

/**
 * Summarize all caches and their entry counts.
 * @param {{ [name: string]: string[] }} cacheMap  name → array of URLs
 * @returns {{ total: number, entries: number, byCache: Record<string,number> }}
 */
export function summarize(cacheMap) {
  const byCache = {};
  let entries = 0;
  for (const [name, urls] of Object.entries(cacheMap)) {
    byCache[name] = urls.length;
    entries += urls.length;
  }
  return { total: Object.keys(cacheMap).length, entries, byCache };
}
