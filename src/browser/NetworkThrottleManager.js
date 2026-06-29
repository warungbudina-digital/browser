/**
 * Network throttle profiles — preset conditions + custom profiles.
 * Pure class, no browser dependency.
 *
 * Throughput values are in bytes/s; latency in ms.
 * Applied via CDP Network.emulateNetworkConditions in BrowserService.
 */

const PRESETS = new Map([
  ['offline',  { downloadThroughput:       0, uploadThroughput:       0, latency:    0, offline: true  }],
  ['slow-3g',  { downloadThroughput:   50000, uploadThroughput:   50000, latency: 2000, offline: false }],
  ['fast-3g',  { downloadThroughput:  187500, uploadThroughput:   93750, latency:   40, offline: false }],
  ['4g',       { downloadThroughput: 2500000, uploadThroughput: 1250000, latency:   20, offline: false }],
  ['wifi',     { downloadThroughput: 3750000, uploadThroughput: 1875000, latency:    2, offline: false }],
  ['cable',    { downloadThroughput:  625000, uploadThroughput:  125000, latency:   14, offline: false }],
  ['dsl',      { downloadThroughput:  250000, uploadThroughput:   48000, latency:   25, offline: false }],
]);

export class NetworkThrottleManager {
  #customs = new Map();

  /** Array of preset names. */
  presets() { return [...PRESETS.keys()]; }

  /** Map of all profiles (presets + custom), each entry includes a `type` field. */
  list() {
    const all = new Map();
    for (const [name, spec] of PRESETS) all.set(name, { ...spec, type: 'preset' });
    for (const [name, spec] of this.#customs) all.set(name, { ...spec, type: 'custom' });
    return all;
  }

  /** Return spec for a given profile name, or null if not found. */
  get(name) {
    if (PRESETS.has(name)) return { ...PRESETS.get(name) };
    if (this.#customs.has(name)) return { ...this.#customs.get(name) };
    return null;
  }

  /** Like get(), but throws if not found. */
  resolve(name) {
    const spec = this.get(name);
    if (!spec) throw new Error(`Unknown throttle profile: ${name}`);
    return spec;
  }

  /**
   * Add a custom throttle profile.
   * @param {string} name
   * @param {{downloadThroughput, uploadThroughput, latency?, offline?}} raw
   * @returns {{downloadThroughput, uploadThroughput, latency, offline}}
   */
  add(name, raw = {}) {
    if (name == null) throw new Error('Profile name is required');
    const n = String(name).trim();
    if (!n) throw new Error('Profile name cannot be blank');
    if (PRESETS.has(n)) throw new Error(`Cannot override preset: ${n}`);
    const spec = this.#validate(raw);
    this.#customs.set(n, spec);
    return { ...spec };
  }

  /**
   * Remove a custom profile.
   * @returns {boolean} true if removed, false if not found
   */
  remove(name) {
    if (PRESETS.has(name)) throw new Error(`Cannot remove preset: ${name}`);
    if (!this.#customs.has(name)) return false;
    this.#customs.delete(name);
    return true;
  }

  /** Validate an inline spec — useful for throttleSet without a named profile. */
  validateSpec(raw) {
    return this.#validate(raw);
  }

  #validate(raw = {}) {
    const downloadThroughput = raw.downloadThroughput == null ? undefined : Number(raw.downloadThroughput);
    const uploadThroughput   = raw.uploadThroughput   == null ? undefined : Number(raw.uploadThroughput);
    const latency            = raw.latency            == null ? 0         : Number(raw.latency);
    const offline            = Boolean(raw.offline ?? false);

    if (downloadThroughput === undefined || isNaN(downloadThroughput)) throw new Error('downloadThroughput is required and must be a number');
    if (uploadThroughput   === undefined || isNaN(uploadThroughput))   throw new Error('uploadThroughput is required and must be a number');
    if (downloadThroughput < 0) throw new Error('downloadThroughput must be non-negative');
    if (uploadThroughput   < 0) throw new Error('uploadThroughput must be non-negative');
    if (isNaN(latency) || latency < 0) throw new Error('latency must be non-negative');

    return { downloadThroughput, uploadThroughput, latency, offline };
  }
}
