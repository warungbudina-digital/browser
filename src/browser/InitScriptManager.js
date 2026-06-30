/**
 * Init script store — manage JavaScript snippets injected into pages
 * before page scripts run (via page.addInitScript).
 * Pure class — no browser dependency.
 *
 * Note: once a script is added to a Playwright page via addInitScript()
 * it cannot be un-installed from that page. Removing from this store only
 * prevents future injections; it does not affect already-running contexts.
 */

export class InitScriptManager {
  #scripts = [];
  #nextId  = 1;

  /**
   * Add a new init script entry.
   * @param {{ name: string, script: string }} opts
   * @returns {{ id: number, name: string }}
   */
  add({ name, script } = {}) {
    if (typeof name !== 'string' || !name.trim()) throw new Error('name must be a non-empty string');
    if (typeof script !== 'string' || !script.trim()) throw new Error('script must be a non-empty string');
    const entry = { id: this.#nextId++, name: name.trim(), script };
    this.#scripts.push(entry);
    return { id: entry.id, name: entry.name };
  }

  /**
   * Remove a script by id.
   * @param {number} id
   * @returns {boolean}
   */
  remove(id) {
    const before = this.#scripts.length;
    this.#scripts = this.#scripts.filter((s) => s.id !== id);
    return this.#scripts.length < before;
  }

  /**
   * Get a script entry by id (including script body).
   * @param {number} id
   * @returns {{ id, name, script }|null}
   */
  get(id) {
    return this.#scripts.find((s) => s.id === id) ?? null;
  }

  /**
   * List all scripts — returns id + name only (script body omitted for brevity).
   * @returns {{ id: number, name: string }[]}
   */
  list() {
    return this.#scripts.map(({ id, name }) => ({ id, name }));
  }

  /** Return all script bodies (for injection into a new page). */
  allScripts() {
    return this.#scripts.map(({ id, name, script }) => ({ id, name, script }));
  }

  /** Remove all entries. */
  clear() {
    this.#scripts = [];
  }

  /** Number of stored scripts. */
  get size() { return this.#scripts.length; }
}
