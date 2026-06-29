const STORAGE_FILE_VERSION = 1;

export const VALID_STORAGE_KINDS = new Set(['localStorage', 'sessionStorage']);

/**
 * Sanitize a user-supplied name into a safe filename (no extension).
 * Mirrors the pattern from SessionPersistence.sessionFilename().
 *
 * @param {string} name
 * @returns {string} e.g. "my-app-state.json"
 */
export function storageFilename(name) {
  if (name == null) throw new Error('Storage name is required');
  const trimmed = String(name).trim();
  if (!trimmed) throw new Error('Storage name cannot be blank');
  return `${trimmed.replace(/[^a-zA-Z0-9._-]+/g, '-')}.json`;
}

/**
 * Serialize a raw key-value storage dump into a versioned file payload.
 *
 * @param {object} raw     Plain object from page.evaluate (key → value)
 * @param {object} [opts]
 * @param {string} [opts.profile]  Profile name for provenance
 * @param {string} [opts.kind]     'localStorage' | 'sessionStorage'
 * @returns {object}
 */
export function serializeStorage(raw, { profile, kind } = {}) {
  const entries = Object.entries(raw || {}).map(([key, value]) => ({
    key:   String(key),
    value: String(value),
  }));
  return {
    version:    STORAGE_FILE_VERSION,
    kind:       kind || null,
    profile:    profile || null,
    entries,
    entryCount: entries.length,
    savedAt:    new Date().toISOString(),
  };
}

/**
 * Validate and parse a stored storage file payload.
 * Throws on malformed data so callers get an explicit error rather than silent corruption.
 *
 * @param {object} data
 * @returns {{ entries: {key,value}[], kind: string|null, profile: string|null }}
 */
export function parseStorageFile(data) {
  if (data == null || typeof data !== 'object') {
    throw new Error('Invalid storage file: expected an object');
  }
  if (data.version !== STORAGE_FILE_VERSION) {
    throw new Error(`Unsupported storage file version: ${data.version}`);
  }
  if (!Array.isArray(data.entries)) {
    throw new Error('Invalid storage file: entries must be an array');
  }
  return {
    entries: data.entries.map((e) => ({ key: String(e.key), value: String(e.value) })),
    kind:    data.kind    || null,
    profile: data.profile || null,
  };
}

/**
 * Filter storage entries by key pattern.
 *
 * @param {{key,value}[]} entries
 * @param {string|RegExp|null} [pattern]  Substring or RegExp matched against key
 * @returns {{key,value}[]} Shallow copies of matching entries
 */
export function filterStorageKeys(entries, pattern) {
  if (pattern == null) return entries.map((e) => ({ ...e }));
  if (pattern instanceof RegExp) return entries.filter((e) => pattern.test(e.key)).map((e) => ({ ...e }));
  return entries.filter((e) => e.key.includes(String(pattern))).map((e) => ({ ...e }));
}

/**
 * Compute a diff between two storage entry arrays.
 *
 * @param {{key,value}[]} before
 * @param {{key,value}[]} after
 * @returns {{ added: {key,value}[], removed: {key,value}[], changed: {key,before,after}[] }}
 */
export function diffStorage(before, after) {
  const beforeMap = new Map(before.map((e) => [e.key, e.value]));
  const afterMap  = new Map(after.map((e)  => [e.key, e.value]));

  const added   = after.filter((e) => !beforeMap.has(e.key)).map((e) => ({ ...e }));
  const removed = before.filter((e) => !afterMap.has(e.key)).map((e) => ({ ...e }));
  const changed = after
    .filter((e) => beforeMap.has(e.key) && beforeMap.get(e.key) !== e.value)
    .map((e) => ({ key: e.key, before: beforeMap.get(e.key), after: e.value }));

  return { added, removed, changed };
}
