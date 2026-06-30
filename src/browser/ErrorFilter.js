/**
 * Page error filter utilities — pure, no browser dependency.
 *
 * Error entry shape (from BrowserService pageerror handler):
 *   { message: string, stack: string, at: ISO-8601 string }
 */

/**
 * Filter errors whose message matches a pattern.
 * String → substring match; RegExp → test against message.
 * @param {object[]}      errors
 * @param {string|RegExp} pattern
 * @returns {object[]} shallow copies
 */
export function filterByMessage(errors, pattern) {
  if (pattern instanceof RegExp) return errors.filter((e) => pattern.test(e.message)).map((e) => ({ ...e }));
  return errors.filter((e) => String(e.message || '').includes(String(pattern))).map((e) => ({ ...e }));
}

/**
 * Filter errors whose stack trace matches a pattern.
 * Entries with null/undefined stack match only if pattern is an empty string.
 * @param {object[]}      errors
 * @param {string|RegExp} pattern
 * @returns {object[]} shallow copies
 */
export function filterByStack(errors, pattern) {
  if (pattern instanceof RegExp) {
    return errors.filter((e) => pattern.test(String(e.stack || ''))).map((e) => ({ ...e }));
  }
  return errors.filter((e) => String(e.stack || '').includes(String(pattern))).map((e) => ({ ...e }));
}

/**
 * Filter errors at or after the given ISO timestamp.
 * @param {object[]} errors
 * @param {string}   since  ISO-8601 string
 * @returns {object[]} shallow copies
 */
export function filterSince(errors, since) {
  const s = String(since);
  return errors.filter((e) => e.at >= s).map((e) => ({ ...e }));
}

/**
 * Filter errors strictly before the given ISO timestamp.
 * @param {object[]} errors
 * @param {string}   before  ISO-8601 string
 * @returns {object[]} shallow copies
 */
export function filterBefore(errors, before) {
  const b = String(before);
  return errors.filter((e) => e.at < b).map((e) => ({ ...e }));
}

/**
 * Extract origin from a stack trace — the first "at ..." line.
 * @param {string|null} stack
 * @returns {string}
 */
function extractOrigin(stack) {
  if (!stack) return 'unknown';
  for (const line of String(stack).split('\n')) {
    const t = line.trim();
    if (t.startsWith('at ')) return t;
  }
  return 'unknown';
}

/**
 * Group errors by their stack origin (first "at ..." line).
 * Errors with no stack are grouped under 'unknown'.
 * @param {object[]} errors
 * @returns {Object.<string, object[]>}
 */
export function groupByOrigin(errors) {
  const groups = {};
  for (const e of errors) {
    const origin = extractOrigin(e.stack);
    if (!groups[origin]) groups[origin] = [];
    groups[origin].push({ ...e });
  }
  return groups;
}

/**
 * Remove duplicate errors by message text (case-sensitive).
 * Keeps the first occurrence of each unique message.
 * @param {object[]} errors
 * @returns {object[]} shallow copies
 */
export function deduplicateByMessage(errors) {
  const seen = new Set();
  return errors
    .filter((e) => {
      if (seen.has(e.message)) return false;
      seen.add(e.message);
      return true;
    })
    .map((e) => ({ ...e }));
}

/**
 * Aggregate stats for a set of error entries.
 * @param {object[]} errors
 * @returns {{ total: number, first: string|null, last: string|null, byOrigin: Object.<string,number> }}
 */
export function summarize(errors) {
  const byOrigin = {};
  let first = null;
  let last  = null;

  for (const e of errors) {
    const origin = extractOrigin(e.stack);
    byOrigin[origin] = (byOrigin[origin] || 0) + 1;
    if (first === null || e.at < first) first = e.at;
    if (last  === null || e.at > last)  last  = e.at;
  }

  return { total: errors.length, byOrigin, first, last };
}

/**
 * Format errors as a plain-text log string.
 * Each entry: `[HH:MM:SS] message`; stack included when stacks=true.
 * @param {object[]} errors
 * @param {{ stacks?: boolean }} [opts]
 * @returns {string}
 */
export function formatText(errors, { stacks = false } = {}) {
  return errors.map((e) => {
    const time = e.at ? String(e.at).slice(11, 19) : '??:??:??';
    const line = `[${time}] ${e.message}`;
    if (stacks && e.stack) return `${line}\n${e.stack}`;
    return line;
  }).join('\n');
}
