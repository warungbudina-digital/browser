/**
 * CSS override store — pure class, no browser dependency.
 *
 * Each rule is injected as a <style id="css-override-{id}"> element via
 * page.evaluate(), allowing individual rules to be removed from the DOM later.
 * This avoids the one-way constraint of page.addStyleTag().
 */

export class CSSOverrideManager {
  #rules  = [];
  #nextId = 1;

  /**
   * Add a CSS rule entry.
   * @param {{ name: string, css: string }} opts
   * @returns {{ id: number, name: string }}
   */
  add({ name, css } = {}) {
    if (typeof name !== 'string' || !name.trim()) throw new Error('name must be a non-empty string');
    if (typeof css  !== 'string' || !css.trim())  throw new Error('css must be a non-empty string');
    const entry = { id: this.#nextId++, name: name.trim(), css };
    this.#rules.push(entry);
    return { id: entry.id, name: entry.name };
  }

  /**
   * Remove a rule by id.
   * @param {number} id
   * @returns {boolean}
   */
  remove(id) {
    const before = this.#rules.length;
    this.#rules = this.#rules.filter((r) => r.id !== id);
    return this.#rules.length < before;
  }

  /**
   * Get a rule by id (including css body).
   * @param {number} id
   * @returns {{ id, name, css }|null}
   */
  get(id) {
    return this.#rules.find((r) => r.id === id) ?? null;
  }

  /**
   * List all rules — id and name only (css body omitted for brevity).
   * @returns {{ id: number, name: string }[]}
   */
  list() {
    return this.#rules.map(({ id, name }) => ({ id, name }));
  }

  /**
   * Return all rules with full css body (for injection on new pages).
   * @returns {{ id: number, name: string, css: string }[]}
   */
  allRules() {
    return this.#rules.map(({ id, name, css }) => ({ id, name, css }));
  }

  /**
   * Merge all stored CSS into a single string.
   * @returns {string}
   */
  combined() {
    return this.#rules.map((r) => `/* ${r.name} */\n${r.css}`).join('\n\n');
  }

  /** Remove all stored rules. */
  clear() {
    this.#rules = [];
  }

  /** Number of stored rules. */
  get size() { return this.#rules.length; }
}

/**
 * DOM element id used to tag injected <style> elements.
 * @param {number} ruleId
 */
export function styleElementId(ruleId) {
  return `css-override-${ruleId}`;
}
