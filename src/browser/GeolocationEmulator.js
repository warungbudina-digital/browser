/**
 * Geolocation emulation — preset cities + custom locations.
 * Pure class, no browser dependency.
 */

const PRESETS = new Map([
  ['New York',   { latitude:  40.7128, longitude:  -74.0060, accuracy: 50 }],
  ['London',     { latitude:  51.5074, longitude:   -0.1278, accuracy: 50 }],
  ['Tokyo',      { latitude:  35.6762, longitude:  139.6503, accuracy: 50 }],
  ['Sydney',     { latitude: -33.8688, longitude:  151.2093, accuracy: 50 }],
  ['Jakarta',    { latitude:  -6.2088, longitude:  106.8456, accuracy: 50 }],
  ['Singapore',  { latitude:   1.3521, longitude:  103.8198, accuracy: 50 }],
  ['Dubai',      { latitude:  25.2048, longitude:   55.2708, accuracy: 50 }],
  ['Paris',      { latitude:  48.8566, longitude:    2.3522, accuracy: 50 }],
  ['Berlin',     { latitude:  52.5200, longitude:   13.4050, accuracy: 50 }],
  ['Sao Paulo',  { latitude: -23.5505, longitude:  -46.6333, accuracy: 50 }],
]);

export class GeolocationEmulator {
  #customs = new Map();

  /** Array of preset names. */
  presets() { return [...PRESETS.keys()]; }

  /** Map of all locations (presets + custom), each entry includes a `type` field. */
  list() {
    const all = new Map();
    for (const [name, spec] of PRESETS) all.set(name, { ...spec, type: 'preset' });
    for (const [name, spec] of this.#customs) all.set(name, { ...spec, type: 'custom' });
    return all;
  }

  /** Return spec for a given location name, or null if not found. */
  get(name) {
    if (PRESETS.has(name)) return { ...PRESETS.get(name) };
    if (this.#customs.has(name)) return { ...this.#customs.get(name) };
    return null;
  }

  /** Like get(), but throws if not found. */
  resolve(name) {
    const spec = this.get(name);
    if (!spec) throw new Error(`Unknown location: ${name}`);
    return spec;
  }

  /**
   * Add a custom location.
   * @param {string} name
   * @param {{latitude, longitude, accuracy?}} raw
   * @returns {{latitude, longitude, accuracy}}
   */
  add(name, raw = {}) {
    if (name == null) throw new Error('Location name is required');
    const n = String(name).trim();
    if (!n) throw new Error('Location name cannot be blank');
    if (PRESETS.has(n)) throw new Error(`Cannot override preset: ${n}`);
    const spec = this.#validate(raw);
    this.#customs.set(n, spec);
    return { ...spec };
  }

  /**
   * Remove a custom location.
   * @returns {boolean} true if removed, false if not found
   */
  remove(name) {
    if (PRESETS.has(name)) throw new Error(`Cannot remove preset: ${name}`);
    if (!this.#customs.has(name)) return false;
    this.#customs.delete(name);
    return true;
  }

  /** Validate an inline spec object — useful for geoEmulate without a named preset. */
  validateSpec(raw) {
    return this.#validate(raw);
  }

  #validate(raw = {}) {
    const latitude  = raw.latitude  == null ? undefined : Number(raw.latitude);
    const longitude = raw.longitude == null ? undefined : Number(raw.longitude);
    const accuracy  = raw.accuracy  == null ? 50        : Number(raw.accuracy);

    if (latitude  === undefined || isNaN(latitude))  throw new Error('latitude is required and must be a number');
    if (longitude === undefined || isNaN(longitude)) throw new Error('longitude is required and must be a number');
    if (latitude  < -90  || latitude  > 90)  throw new Error('latitude must be between -90 and 90');
    if (longitude < -180 || longitude > 180) throw new Error('longitude must be between -180 and 180');
    if (isNaN(accuracy) || accuracy <= 0)    throw new Error('accuracy must be a positive number');

    return { latitude, longitude, accuracy };
  }
}
