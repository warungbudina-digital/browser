/**
 * Service Worker registration utilities — pure functions, no browser dependency.
 *
 * Registration schema:
 *   { scope, active: { scriptURL, state }|null,
 *     waiting: {...}|null, installing: {...}|null }
 */

/**
 * Filter registrations whose scope matches a substring or RegExp.
 * @param {{ scope: string }[]} registrations
 * @param {string|RegExp} pattern
 */
export function filterByScope(registrations, pattern) {
  if (pattern instanceof RegExp) return registrations.filter((r) => pattern.test(r.scope));
  return registrations.filter((r) => r.scope.includes(String(pattern)));
}

/**
 * Filter registrations by the state of the active worker.
 * Valid states: 'parsed' | 'installing' | 'installed' | 'activating' | 'activated' | 'redundant'
 * @param {{ active: { state: string }|null }[]} registrations
 * @param {string} state
 */
export function filterByState(registrations, state) {
  return registrations.filter((r) => r.active?.state === state);
}

/**
 * Find a registration whose scope exactly matches or contains the given string.
 * Returns the first match or null.
 * @param {{ scope: string }[]} registrations
 * @param {string} scope
 */
export function findByScope(registrations, scope) {
  return registrations.find((r) => r.scope === scope || r.scope.includes(scope)) || null;
}

/**
 * Summarize service worker registrations.
 * @param {{ active: *|null, waiting: *|null, installing: *|null }[]} registrations
 * @returns {{ total: number, active: number, waiting: number, installing: number, redundant: number }}
 */
export function summarize(registrations) {
  let active = 0;
  let waiting = 0;
  let installing = 0;
  let redundant = 0;
  for (const r of registrations) {
    if (r.active)     active++;
    if (r.waiting)    waiting++;
    if (r.installing) installing++;
    if (r.active?.state === 'redundant') redundant++;
  }
  return { total: registrations.length, active, waiting, installing, redundant };
}
