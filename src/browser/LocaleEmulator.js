/**
 * Locale and timezone emulation — preset combinations + custom entries.
 * Pure class, no browser dependency.
 *
 * Applied via CDP Emulation.setLocaleOverride / Emulation.setTimezoneOverride
 * in BrowserService (unlike viewport/geolocation these can be changed at runtime).
 */

const PRESETS = new Map([
  ['en-US', { locale: 'en-US', timezone: 'America/New_York',  currency: 'USD', direction: 'ltr' }],
  ['en-GB', { locale: 'en-GB', timezone: 'Europe/London',     currency: 'GBP', direction: 'ltr' }],
  ['zh-CN', { locale: 'zh-CN', timezone: 'Asia/Shanghai',     currency: 'CNY', direction: 'ltr' }],
  ['ja-JP', { locale: 'ja-JP', timezone: 'Asia/Tokyo',        currency: 'JPY', direction: 'ltr' }],
  ['ko-KR', { locale: 'ko-KR', timezone: 'Asia/Seoul',        currency: 'KRW', direction: 'ltr' }],
  ['de-DE', { locale: 'de-DE', timezone: 'Europe/Berlin',     currency: 'EUR', direction: 'ltr' }],
  ['fr-FR', { locale: 'fr-FR', timezone: 'Europe/Paris',      currency: 'EUR', direction: 'ltr' }],
  ['es-ES', { locale: 'es-ES', timezone: 'Europe/Madrid',     currency: 'EUR', direction: 'ltr' }],
  ['pt-BR', { locale: 'pt-BR', timezone: 'America/Sao_Paulo', currency: 'BRL', direction: 'ltr' }],
  ['ar-SA', { locale: 'ar-SA', timezone: 'Asia/Riyadh',       currency: 'SAR', direction: 'rtl' }],
  ['id-ID', { locale: 'id-ID', timezone: 'Asia/Jakarta',      currency: 'IDR', direction: 'ltr' }],
  ['hi-IN', { locale: 'hi-IN', timezone: 'Asia/Kolkata',      currency: 'INR', direction: 'ltr' }],
]);

export class LocaleEmulator {
  #customs = new Map();

  /** Array of preset names. */
  presets() { return [...PRESETS.keys()]; }

  /** Map of all locales (presets + custom), each entry includes a `type` field. */
  list() {
    const all = new Map();
    for (const [name, spec] of PRESETS) all.set(name, { ...spec, type: 'preset' });
    for (const [name, spec] of this.#customs) all.set(name, { ...spec, type: 'custom' });
    return all;
  }

  /** Return spec for a given locale name, or null if not found. */
  get(name) {
    if (PRESETS.has(name)) return { ...PRESETS.get(name) };
    if (this.#customs.has(name)) return { ...this.#customs.get(name) };
    return null;
  }

  /** Like get(), but throws if not found. */
  resolve(name) {
    const spec = this.get(name);
    if (!spec) throw new Error(`Unknown locale: ${name}`);
    return spec;
  }

  /**
   * Add a custom locale entry.
   * @param {string} name
   * @param {{locale, timezone, currency?, direction?}} raw
   * @returns {{locale, timezone, currency, direction}}
   */
  add(name, raw = {}) {
    if (name == null) throw new Error('Locale name is required');
    const n = String(name).trim();
    if (!n) throw new Error('Locale name cannot be blank');
    if (PRESETS.has(n)) throw new Error(`Cannot override preset: ${n}`);
    const spec = this.#validate(raw);
    this.#customs.set(n, spec);
    return { ...spec };
  }

  /**
   * Remove a custom locale entry.
   * @returns {boolean} true if removed, false if not found
   */
  remove(name) {
    if (PRESETS.has(name)) throw new Error(`Cannot remove preset: ${name}`);
    if (!this.#customs.has(name)) return false;
    this.#customs.delete(name);
    return true;
  }

  /** Validate an inline spec — useful for localeEmulate without a named preset. */
  validateSpec(raw) {
    return this.#validate(raw);
  }

  #validate(raw = {}) {
    const locale    = raw.locale    == null ? undefined : String(raw.locale).trim();
    const timezone  = raw.timezone  == null ? undefined : String(raw.timezone).trim();
    const currency  = raw.currency  == null ? null      : String(raw.currency).trim();
    const direction = raw.direction == null ? 'ltr'     : String(raw.direction);

    if (!locale)   throw new Error('locale is required and cannot be blank');
    if (!timezone) throw new Error('timezone is required and cannot be blank');
    if (direction !== 'ltr' && direction !== 'rtl') throw new Error("direction must be 'ltr' or 'rtl'");

    return { locale, timezone, currency, direction };
  }
}
