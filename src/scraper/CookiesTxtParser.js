/**
 * Parser untuk cookies.txt format Netscape — hasil export dari ekstensi browser
 * "Get cookies.txt LOCALLY" (atau ekstensi sejenis) di browser pribadi user.
 *
 * Format per baris (tab-separated):
 *   domain  includeSubdomains  path  secure  expiration  name  value
 * Baris dengan prefix "#HttpOnly_" pada domain menandai cookie httpOnly.
 * Baris komentar (diawali "#" tanpa prefix HttpOnly_) dan baris kosong diabaikan.
 *
 * Output: array cookie siap pakai untuk Playwright/Patchright `context.addCookies()`
 * (dipakai via BrowserService.cookies({kind:'set', cookies})).
 */

const HTTPONLY_PREFIX = '#HttpOnly_';

/** Parse satu baris cookies.txt. Return null jika baris komentar/kosong/invalid. */
function parseLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let httpOnly = false;
  let rest = trimmed;
  if (rest.startsWith(HTTPONLY_PREFIX)) {
    httpOnly = true;
    rest = rest.slice(HTTPONLY_PREFIX.length);
  } else if (rest.startsWith('#')) {
    return null; // baris komentar biasa
  }

  const fields = rest.split('\t');
  if (fields.length < 7) return null;

  const [domain, includeSubdomains, path, secureRaw, expirationRaw, name, ...valueParts] = fields;
  const value = valueParts.join('\t'); // value bisa mengandung tab jika di-escape aneh — jaga-jaga

  const secure = secureRaw.toUpperCase() === 'TRUE';
  const expirationNum = Number(expirationRaw);
  const expires = Number.isFinite(expirationNum) && expirationNum > 0 ? expirationNum : -1; // -1 = session cookie

  let normalizedDomain = domain;
  if (includeSubdomains.toUpperCase() === 'TRUE' && !normalizedDomain.startsWith('.')) {
    normalizedDomain = `.${normalizedDomain}`;
  }

  return {
    name,
    value,
    domain: normalizedDomain,
    path: path || '/',
    expires,
    httpOnly,
    secure,
  };
}

/** Parse seluruh isi file cookies.txt menjadi array cookie Playwright. */
export function parseCookiesTxt(text) {
  if (typeof text !== 'string' || !text.trim()) return [];
  return text
    .split('\n')
    .map(parseLine)
    .filter((c) => c !== null);
}
