/**
 * SessionPersistence — pure helpers for saving and loading Playwright auth state.
 * No filesystem or browser dependency — all FS/context I/O is done in BrowserService.
 *
 * Session file format (version 1):
 * {
 *   version:      1,
 *   savedAt:      ISO string,
 *   profile:      string,
 *   cookies:      Playwright Cookie[],
 *   origins:      Playwright OriginsState[],
 *   cookieCount:  number,
 *   originCount:  number,
 * }
 */

export const SESSION_VERSION = 1;

// Characters allowed in a session name (alphanumeric + dash/underscore)
const SAFE_NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;

/**
 * Validate and sanitize a session name, return the filename ("<name>.json").
 * @throws {Error} if the name is invalid
 */
export function sessionFilename(name) {
  if (name == null || typeof name !== 'string') throw new Error('Session name is required');
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Session name cannot be blank');
  if (trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\')) {
    throw new Error('Session name must not contain path separators or ".."');
  }
  if (!SAFE_NAME_RE.test(trimmed)) {
    throw new Error('Session name may only contain letters, numbers, dashes and underscores (max 64 chars)');
  }
  return `${trimmed}.json`;
}

/**
 * Wrap a Playwright `storageState()` result in our session envelope.
 * @param {{ cookies?: object[], origins?: object[] }|null} storageState
 * @param {{ profile?: string, savedAt?: string }} opts
 */
export function serializeSession(storageState, { profile = '', savedAt = null } = {}) {
  if (!storageState || typeof storageState !== 'object') {
    throw new Error('storageState must be a non-null object');
  }
  const cookies = Array.isArray(storageState.cookies) ? storageState.cookies : [];
  const origins = Array.isArray(storageState.origins) ? storageState.origins : [];
  return {
    version:     SESSION_VERSION,
    savedAt:     savedAt ?? new Date().toISOString(),
    profile:     String(profile),
    cookies,
    origins,
    cookieCount: cookies.length,
    originCount: origins.length,
  };
}

/**
 * Parse and validate a session file (either our envelope or raw Playwright format).
 * Returns { cookies, origins }.
 * @throws {Error} if the structure is invalid
 */
export function parseSessionFile(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid session file: not an object');

  // Our envelope format (version present)
  if ('version' in raw) {
    if (raw.version !== SESSION_VERSION) {
      throw new Error(`Unsupported session version: ${raw.version}`);
    }
    if (!Array.isArray(raw.cookies)) throw new Error('Invalid session file: cookies must be an array');
    return {
      cookies:  raw.cookies,
      origins:  Array.isArray(raw.origins) ? raw.origins : [],
      savedAt:  raw.savedAt ?? null,
      profile:  raw.profile ?? '',
    };
  }

  // Raw Playwright storageState format (no version field)
  if (!Array.isArray(raw.cookies)) throw new Error('Invalid session file: cookies must be an array');
  return {
    cookies: raw.cookies,
    origins: Array.isArray(raw.origins) ? raw.origins : [],
    savedAt: null,
    profile: '',
  };
}

/**
 * Filter out expired cookies (those whose `expires` field is in the past).
 * Cookies without an `expires` field (session cookies) are kept.
 * @param {object[]} cookies
 * @param {Date} [now]
 */
export function filterExpiredCookies(cookies, now = new Date()) {
  const nowSec = Math.floor(now.getTime() / 1000);
  return cookies.filter((c) => !c.expires || c.expires === -1 || c.expires > nowSec);
}
