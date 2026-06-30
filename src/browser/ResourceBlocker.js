/**
 * Resource type blocker — block browser requests by resource type.
 * Pure class, no browser dependency.
 *
 * Resource types come from Playwright's route.request().resourceType():
 * https://playwright.dev/docs/api/class-request#request-resource-type
 *
 * Applied inside the existing route handler in BrowserService.
 */

export const VALID_RESOURCE_TYPES = new Set([
  'document', 'stylesheet', 'image', 'media', 'font',
  'script', 'texttrack', 'xhr', 'fetch', 'eventsource',
  'websocket', 'manifest', 'other',
]);

export class ResourceBlocker {
  #blocked = new Set();

  /**
   * Block one or more resource types.
   * @param {string|string[]} types
   * @returns {string[]} full list of currently blocked types
   */
  block(types) {
    for (const t of this.#normalize(types)) this.#blocked.add(t);
    return [...this.#blocked];
  }

  /**
   * Unblock one or more resource types.
   * No-op for types that are not currently blocked.
   * @param {string|string[]} types
   * @returns {string[]} remaining blocked types
   */
  unblock(types) {
    for (const t of this.#normalize(types)) this.#blocked.delete(t);
    return [...this.#blocked];
  }

  /**
   * Check if a resource type is currently blocked.
   * @param {string} type
   * @returns {boolean}
   */
  isBlocked(type) {
    return this.#blocked.has(type);
  }

  /**
   * Return the list of currently blocked resource types.
   * @returns {string[]}
   */
  blockedTypes() {
    return [...this.#blocked];
  }

  /** Clear all blocked types. */
  clear() {
    this.#blocked.clear();
  }

  #normalize(types) {
    const arr = Array.isArray(types) ? types : [types];
    for (const t of arr) {
      if (!VALID_RESOURCE_TYPES.has(t)) throw new Error(`Invalid resource type: ${t}`);
    }
    return arr;
  }
}
