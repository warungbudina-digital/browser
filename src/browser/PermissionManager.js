/**
 * Browser permission tracking — per-page grant/revoke/reset.
 * Pure class, no browser dependency.
 *
 * Tracks which permissions have been granted per targetId so that
 * BrowserService can re-apply the correct set after a revoke
 * (Playwright only supports clearPermissions + grantPermissions).
 */

export const VALID_PERMISSIONS = new Set([
  'geolocation',
  'notifications',
  'camera',
  'microphone',
  'background-sync',
  'ambient-light-sensor',
  'accelerometer',
  'gyroscope',
  'magnetometer',
  'accessibility-events',
  'clipboard-read',
  'clipboard-write',
  'payment-handler',
  'midi',
  'midi-sysex',
]);

export class PermissionManager {
  #grants = new Map(); // targetId → Set<string>

  /**
   * Grant one or more permissions for a targetId.
   * Merges with existing grants.
   * @param {string}          targetId
   * @param {string|string[]} permissions
   * @returns {string[]} full list of granted permissions for this targetId
   */
  grant(targetId, permissions) {
    if (targetId == null) throw new Error('targetId is required');
    const perms = this.#normalizeList(permissions);
    if (!this.#grants.has(targetId)) this.#grants.set(targetId, new Set());
    for (const p of perms) this.#grants.get(targetId).add(p);
    return [...this.#grants.get(targetId)];
  }

  /**
   * Revoke one or more permissions for a targetId.
   * @param {string}          targetId
   * @param {string|string[]} permissions
   * @returns {string[]} remaining granted permissions for this targetId
   */
  revoke(targetId, permissions) {
    if (targetId == null) throw new Error('targetId is required');
    const perms   = this.#normalizeList(permissions);
    const current = this.#grants.get(targetId);
    if (!current) return [];
    for (const p of perms) current.delete(p);
    return [...current];
  }

  /** Clear all permissions for a specific targetId. */
  reset(targetId) {
    this.#grants.delete(targetId);
  }

  /** Clear all permissions for all targetIds. */
  resetAll() {
    this.#grants.clear();
  }

  /**
   * List granted permissions for a targetId.
   * Returns empty array if targetId is unknown.
   * @returns {string[]}
   */
  list(targetId) {
    return [...(this.#grants.get(targetId) ?? [])];
  }

  /**
   * Return all tracked targetId → permissions mappings.
   * @returns {Object.<string, string[]>}
   */
  listAll() {
    const result = {};
    for (const [id, perms] of this.#grants) result[id] = [...perms];
    return result;
  }

  #normalizeList(permissions) {
    const arr = Array.isArray(permissions) ? permissions : [permissions];
    for (const p of arr) {
      if (!VALID_PERMISSIONS.has(p)) throw new Error(`Invalid permission: ${p}`);
    }
    return arr;
  }
}
