/**
 * ScriptStore — in-memory registry of named action sequences (macros).
 * Each script is an array of act-request objects (same shape as BrowserService.act).
 * Scripts are global (shared across profiles); targetId is supplied at run-time.
 */
export class ScriptStore {
  #scripts = new Map(); // name → ScriptEntry

  /**
   * Save (create or overwrite) a named script.
   * @param {string} name
   * @param {{ steps: object[], description?: string }}
   * @returns {ScriptEntry}
   */
  save(name, { steps, description = '' }) {
    if (!name || typeof name !== 'string' || !name.trim()) {
      throw new Error('Script name is required');
    }
    if (!Array.isArray(steps) || steps.length === 0) {
      throw new Error('Script steps cannot be empty');
    }
    const now      = new Date().toISOString();
    const existing = this.#scripts.get(name);
    const entry    = {
      name,
      steps,
      description:  String(description),
      createdAt:    existing?.createdAt ?? now,
      updatedAt:    now,
      stepCount:    steps.length,
    };
    this.#scripts.set(name, entry);
    return entry;
  }

  /** @returns {ScriptEntry|null} */
  get(name) { return this.#scripts.get(name) ?? null; }

  /** @returns {ScriptEntry[]} */
  list() { return [...this.#scripts.values()]; }

  /**
   * Delete a script by name.
   * @throws if the script does not exist
   */
  delete(name) {
    if (!this.#scripts.has(name)) throw new Error(`Script not found: ${name}`);
    this.#scripts.delete(name);
    return true;
  }

  exists(name) { return this.#scripts.has(name); }
  size()       { return this.#scripts.size; }
}
