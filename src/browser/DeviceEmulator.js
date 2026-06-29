/**
 * Built-in device presets.
 * deviceScaleFactor, mobile, and userAgent are optional at the spec level;
 * resolve() fills defaults before returning.
 */
const PRESETS = new Map([
  ['iPhone 14',   { width: 390,  height: 844,  deviceScaleFactor: 3,     mobile: true  }],
  ['iPhone SE',   { width: 375,  height: 667,  deviceScaleFactor: 2,     mobile: true  }],
  ['Pixel 7',     { width: 412,  height: 915,  deviceScaleFactor: 2.625, mobile: true  }],
  ['Galaxy S21',  { width: 360,  height: 800,  deviceScaleFactor: 3,     mobile: true  }],
  ['iPad Air',    { width: 820,  height: 1180, deviceScaleFactor: 2,     mobile: true  }],
  ['iPad Mini',   { width: 744,  height: 1133, deviceScaleFactor: 2,     mobile: true  }],
  ['Desktop HD',  { width: 1920, height: 1080, deviceScaleFactor: 1,     mobile: false }],
  ['Desktop FHD', { width: 1280, height: 800,  deviceScaleFactor: 1,     mobile: false }],
]);

/**
 * Device preset registry for viewport / UA emulation.
 *
 * Built-in presets are read-only. Custom devices can be added and removed.
 * resolve() is the canonical lookup — it throws for unknown names and fills
 * spec defaults, making it safe to pass directly to BrowserService.
 */
export class DeviceEmulator {
  #custom = new Map();

  /** Names of built-in device presets. */
  presets() {
    return [...PRESETS.keys()];
  }

  /** Names of all known devices (presets + custom). */
  list() {
    return [...PRESETS.keys(), ...this.#custom.keys()];
  }

  /**
   * Look up a device spec by name.
   * Returns null when not found (never throws).
   *
   * @param {string} name
   * @returns {{ width, height, deviceScaleFactor, mobile, userAgent }|null}
   */
  get(name) {
    const raw = PRESETS.get(name) ?? this.#custom.get(name) ?? null;
    return raw ? this.#fill(name, raw) : null;
  }

  /**
   * Look up a device spec by name, throwing when not found.
   *
   * @param {string} name
   * @returns {{ name, width, height, deviceScaleFactor, mobile, userAgent }}
   */
  resolve(name) {
    const spec = this.get(name);
    if (!spec) throw new Error(`Unknown device: "${name}". Use list() to see available devices.`);
    return spec;
  }

  /**
   * Register a custom device (or overwrite an existing custom one).
   * Cannot override built-in presets.
   *
   * @param {string} name
   * @param {object} opts
   * @param {number}  opts.width             Viewport width in CSS pixels (>= 100)
   * @param {number}  opts.height            Viewport height in CSS pixels (>= 100)
   * @param {number}  [opts.deviceScaleFactor] Default 1
   * @param {boolean} [opts.mobile]           Default false
   * @param {string}  [opts.userAgent]        Optional UA override
   * @returns {{ name, width, height, deviceScaleFactor, mobile, userAgent }}
   */
  add(name, { width, height, deviceScaleFactor = 1, mobile = false, userAgent } = {}) {
    if (!name || typeof name !== 'string') throw new Error('name is required');
    if (PRESETS.has(name)) throw new Error(`Cannot override built-in preset: "${name}"`);
    if (!Number.isInteger(width)  || width  < 100) throw new Error('width must be an integer >= 100');
    if (!Number.isInteger(height) || height < 100) throw new Error('height must be an integer >= 100');
    if (typeof deviceScaleFactor !== 'number' || deviceScaleFactor <= 0) {
      throw new Error('deviceScaleFactor must be a positive number');
    }
    const spec = { width, height, deviceScaleFactor, mobile: Boolean(mobile), userAgent: userAgent || null };
    this.#custom.set(name, spec);
    return { name, ...spec };
  }

  /**
   * Remove a custom device by name.
   * Returns true if found and removed, false if not found.
   * Throws when attempting to remove a built-in preset.
   *
   * @param {string} name
   * @returns {boolean}
   */
  remove(name) {
    if (PRESETS.has(name)) throw new Error(`Cannot remove built-in preset: "${name}"`);
    return this.#custom.delete(name);
  }

  #fill(name, raw) {
    return {
      name,
      width:             raw.width,
      height:            raw.height,
      deviceScaleFactor: raw.deviceScaleFactor ?? 1,
      mobile:            raw.mobile ?? false,
      userAgent:         raw.userAgent ?? null,
    };
  }
}
