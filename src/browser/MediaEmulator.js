/**
 * CSS media feature emulation — pure class, no browser dependency.
 *
 * Stores the current override state and exposes toCDP() for
 * Emulation.setEmulatedMedia. Call reset() to clear all overrides.
 */

export const MEDIA_FEATURES = Object.freeze({
  'prefers-color-scheme':   Object.freeze(['light', 'dark', 'no-preference']),
  'prefers-reduced-motion': Object.freeze(['no-preference', 'reduce']),
  'prefers-contrast':       Object.freeze(['no-preference', 'high', 'low', 'forced']),
  'forced-colors':          Object.freeze(['none', 'active']),
});

export const VALID_MEDIA_TYPES = Object.freeze(new Set(['', 'screen', 'print']));

export class MediaEmulator {
  #features  = new Map(); // feature name → value
  #mediaType = '';

  /**
   * Set or update a media feature override.
   * @param {string} name  - feature name from MEDIA_FEATURES
   * @param {string} value - valid value for this feature
   */
  setFeature(name, value) {
    if (!Object.prototype.hasOwnProperty.call(MEDIA_FEATURES, name)) {
      throw new Error(`Unknown media feature: ${name}. Valid: ${Object.keys(MEDIA_FEATURES).join(', ')}`);
    }
    const valid = MEDIA_FEATURES[name];
    if (!valid.includes(value)) {
      throw new Error(`Invalid value "${value}" for ${name}. Valid: ${valid.join(', ')}`);
    }
    this.#features.set(name, value);
  }

  /**
   * Remove a single media feature override.
   * @param {string} name
   * @returns {boolean} true if removed, false if not set
   */
  removeFeature(name) {
    return this.#features.delete(name);
  }

  /**
   * Set the emulated media type ('screen', 'print', or '' to clear).
   * @param {string} type
   */
  setMediaType(type) {
    if (!VALID_MEDIA_TYPES.has(type)) {
      throw new Error(`Invalid media type: "${type}". Valid: ${[...VALID_MEDIA_TYPES].map((t) => t || '(empty)').join(', ')}`);
    }
    this.#mediaType = type;
  }

  /**
   * Get the current value for a feature, or null if not set.
   * @param {string} name
   * @returns {string|null}
   */
  getFeature(name) {
    return this.#features.get(name) ?? null;
  }

  /** Current active feature overrides as array. */
  currentFeatures() {
    return [...this.#features.entries()].map(([name, value]) => ({ name, value }));
  }

  /** Current media type override ('' = none). */
  currentMediaType() {
    return this.#mediaType;
  }

  /** Clear all overrides. */
  reset() {
    this.#features.clear();
    this.#mediaType = '';
  }

  /**
   * Serialize to CDP Emulation.setEmulatedMedia payload.
   * @returns {{ media: string, features: { name: string, value: string }[] }}
   */
  toCDP() {
    return {
      media:    this.#mediaType,
      features: this.currentFeatures(),
    };
  }

  /** Number of active feature overrides. */
  get size() { return this.#features.size; }
}
