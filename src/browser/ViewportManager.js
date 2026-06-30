/**
 * Viewport preset manager for responsive testing.
 * Pure class — no browser dependency.
 *
 * Builtin presets mirror Chrome DevTools responsive breakpoints.
 * Users may add custom presets; builtins are read-only.
 */

export const BUILTIN_VIEWPORTS = Object.freeze({
  'mobile-s': { width: 320,  height: 568  },
  'mobile-m': { width: 375,  height: 667  },
  'mobile-l': { width: 425,  height: 812  },
  'tablet':   { width: 768,  height: 1024 },
  'laptop':   { width: 1280, height: 800  },
  'laptop-l': { width: 1440, height: 900  },
  '2k':       { width: 2048, height: 1152 },
  '4k':       { width: 3840, height: 2160 },
});

export class ViewportManager {
  #custom = new Map();

  /**
   * List all presets (builtins + custom).
   * @returns {{ name: string, width: number, height: number, builtin: boolean }[]}
   */
  list() {
    const result = [];
    for (const [name, spec] of Object.entries(BUILTIN_VIEWPORTS)) {
      result.push({ name, ...spec, builtin: true });
    }
    for (const [name, spec] of this.#custom) {
      result.push({ name, ...spec, builtin: false });
    }
    return result;
  }

  /**
   * Add a custom preset.
   * Throws if name already exists (builtin or custom).
   * @param {string} name
   * @param {{ width: number, height: number }} spec
   */
  add(name, spec) {
    if (typeof name !== 'string' || !name.trim()) throw new Error('name must be a non-empty string');
    if (Object.prototype.hasOwnProperty.call(BUILTIN_VIEWPORTS, name)) {
      throw new Error(`Cannot override builtin preset: ${name}`);
    }
    if (this.#custom.has(name)) throw new Error(`Preset already exists: ${name}`);
    const normalized = this.#validate(spec);
    this.#custom.set(name, normalized);
    return { name, ...normalized, builtin: false };
  }

  /**
   * Remove a custom preset.
   * Throws if name is a builtin.
   * Returns true if removed, false if not found.
   * @param {string} name
   * @returns {boolean}
   */
  remove(name) {
    if (Object.prototype.hasOwnProperty.call(BUILTIN_VIEWPORTS, name)) {
      throw new Error(`Cannot remove builtin preset: ${name}`);
    }
    if (!this.#custom.has(name)) return false;
    this.#custom.delete(name);
    return true;
  }

  /**
   * Get a preset by name. Returns null if not found.
   * @param {string} name
   * @returns {{ width: number, height: number }|null}
   */
  get(name) {
    if (Object.prototype.hasOwnProperty.call(BUILTIN_VIEWPORTS, name)) {
      return { ...BUILTIN_VIEWPORTS[name] };
    }
    const custom = this.#custom.get(name);
    return custom ? { ...custom } : null;
  }

  /**
   * Resolve a name or inline spec to a validated viewport spec.
   * Accepts either a preset name (string) or { width, height } object.
   * @param {string|{ width: number, height: number }} nameOrSpec
   * @returns {{ width: number, height: number }}
   */
  resolve(nameOrSpec) {
    if (typeof nameOrSpec === 'string') {
      const spec = this.get(nameOrSpec);
      if (!spec) throw new Error(`Unknown viewport preset: ${nameOrSpec}`);
      return spec;
    }
    return this.#validate(nameOrSpec);
  }

  /** @returns {{ width: number, height: number }} */
  #validate(spec) {
    if (spec == null || typeof spec !== 'object') throw new Error('viewport spec must be an object');
    const width  = Number(spec.width);
    const height = Number(spec.height);
    if (!Number.isInteger(width)  || width  < 1) throw new Error('width must be a positive integer');
    if (!Number.isInteger(height) || height < 1) throw new Error('height must be a positive integer');
    return { width, height };
  }

  get size() { return Object.keys(BUILTIN_VIEWPORTS).length + this.#custom.size; }
}
