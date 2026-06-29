/**
 * Cookie utility functions — pure, no browser dependency.
 *
 * All filter functions return shallow copies of matched cookies so callers
 * can safely mutate results without affecting the source array.
 *
 * Cookie shape (Playwright / Patchright):
 *   { name, value, domain, path, expires, secure, httpOnly, sameSite }
 *   expires: Unix timestamp in seconds, -1 for session cookies
 */

/**
 * Filter cookies that would be sent to the given domain.
 * A cookie with domain '.example.com' matches 'example.com' and 'sub.example.com'.
 * A cookie with domain 'example.com' (no leading dot) matches only 'example.com'.
 *
 * @param {object[]} cookies
 * @param {string}   domain   Target domain (e.g. 'api.example.com')
 * @returns {object[]}
 */
export function filterByDomain(cookies, domain) {
  const d = String(domain);
  return cookies
    .filter((c) => {
      const cd = String(c.domain || '');
      if (cd.startsWith('.')) {
        const base = cd.slice(1);
        return d === base || d.endsWith('.' + base);
      }
      return d === cd;
    })
    .map((c) => ({ ...c }));
}

/**
 * Filter cookies by name.
 * String pattern → substring match.
 * RegExp pattern → test against cookie name.
 *
 * @param {object[]}      cookies
 * @param {string|RegExp} pattern
 * @returns {object[]}
 */
export function filterByName(cookies, pattern) {
  if (pattern instanceof RegExp) return cookies.filter((c) => pattern.test(c.name)).map((c) => ({ ...c }));
  return cookies.filter((c) => c.name.includes(String(pattern))).map((c) => ({ ...c }));
}

/**
 * Filter cookies applicable to the given request path (RFC 6265 path matching).
 * A cookie with path '/api' is sent to '/api', '/api/', '/api/v2/data', etc.
 *
 * @param {object[]} cookies
 * @param {string}   requestPath
 * @returns {object[]}
 */
export function filterByPath(cookies, requestPath) {
  const rp = String(requestPath);
  return cookies
    .filter((c) => {
      const cp = String(c.path || '/');
      if (rp === cp) return true;
      if (cp === '/') return true;
      return rp.startsWith(cp.endsWith('/') ? cp : cp + '/');
    })
    .map((c) => ({ ...c }));
}

/**
 * Return cookies whose expiry has passed.
 * Session cookies (expires === -1 or missing) are never considered expired.
 *
 * @param {object[]} cookies
 * @param {number}   [now]    Current time in ms (defaults to Date.now())
 * @returns {object[]}
 */
export function filterExpired(cookies, now = Date.now()) {
  return cookies
    .filter((c) => {
      if (c.expires == null || c.expires === -1) return false;
      return c.expires * 1000 < now;
    })
    .map((c) => ({ ...c }));
}

/**
 * Group cookies by their domain field.
 *
 * @param {object[]} cookies
 * @returns {Object.<string, object[]>}
 */
export function groupByDomain(cookies) {
  const groups = {};
  for (const c of cookies) {
    const d = c.domain || '';
    if (!groups[d]) groups[d] = [];
    groups[d].push({ ...c });
  }
  return groups;
}

/**
 * Compute a diff between two cookie arrays.
 * Cookies are matched by (name, domain, path).
 *
 * @param {object[]} before
 * @param {object[]} after
 * @returns {{ added: object[], removed: object[], changed: {name,domain,before,after}[] }}
 */
export function diffCookies(before, after) {
  const key = (c) => `${c.name}::${c.domain || ''}::${c.path || '/'}`;
  const beforeMap = new Map(before.map((c) => [key(c), c]));
  const afterMap  = new Map(after.map((c) => [key(c), c]));

  const added   = after.filter((c) => !beforeMap.has(key(c))).map((c) => ({ ...c }));
  const removed = before.filter((c) => !afterMap.has(key(c))).map((c) => ({ ...c }));
  const changed = after
    .filter((c) => beforeMap.has(key(c)) && beforeMap.get(key(c)).value !== c.value)
    .map((c) => ({
      name:   c.name,
      domain: c.domain,
      path:   c.path,
      before: beforeMap.get(key(c)).value,
      after:  c.value,
    }));

  return { added, removed, changed };
}

/**
 * Export cookies as a Netscape HTTP Cookie file.
 * Compatible with curl (-b/-c flags), wget, and most HTTP clients.
 *
 * Line format (tab-separated):
 *   domain  include_subdomains  path  secure  expires  name  value
 *
 * @param {object[]} cookies
 * @returns {string}
 */
export function formatNetscape(cookies) {
  const lines = ['# Netscape HTTP Cookie File', '#'];
  for (const c of cookies) {
    const domain     = String(c.domain || '');
    const subdomains = domain.startsWith('.') ? 'TRUE' : 'FALSE';
    const path       = String(c.path || '/');
    const secure     = c.secure ? 'TRUE' : 'FALSE';
    const expires    = (c.expires != null && c.expires !== -1) ? String(Math.floor(c.expires)) : '0';
    lines.push([domain, subdomains, path, secure, expires, String(c.name), String(c.value)].join('\t'));
  }
  return lines.join('\n') + '\n';
}

/**
 * Parse a Netscape HTTP Cookie file into a cookie array.
 * Comment lines (starting with #) and blank lines are ignored.
 *
 * @param {string} text
 * @returns {object[]}
 */
export function parseNetscape(text) {
  const cookies = [];
  for (const line of String(text).split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const parts = trimmed.split('\t');
    if (parts.length < 7) continue;
    const [domain, , path, secure, expires, name, value] = parts;
    cookies.push({
      domain,
      path,
      secure:  secure === 'TRUE',
      expires: expires === '0' ? -1 : Number(expires),
      name,
      value,
    });
  }
  return cookies;
}
