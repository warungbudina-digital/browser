/**
 * KeyStore — multi-key API key registry.
 *
 * Supports two env formats:
 *   API_KEYS=admin:secretA,bot1:secretB   → multiple named keys
 *   API_KEY=singlesecret                  → single key named "default"
 *
 * If neither is set, the store is empty and auth is disabled (open mode).
 */
export class KeyStore {
  #keys = new Map(); // token → name

  constructor({ key = null, keys = [] } = {}) {
    for (const { name, key: k } of keys) {
      if (name && k) this.#keys.set(k, name);
    }
    if (this.#keys.size === 0 && key) {
      this.#keys.set(key, 'default');
    }
  }

  /** True if no keys are registered (open / dev mode). */
  isEmpty() {
    return this.#keys.size === 0;
  }

  /**
   * Resolve a Bearer token to { name, key } or null if not found.
   * @param {string} token
   * @returns {{ name: string, key: string } | null}
   */
  lookup(token) {
    const name = this.#keys.get(token);
    return name != null ? { name, key: token } : null;
  }

  /** List registered key names (secrets never exposed). */
  names() {
    return [...this.#keys.values()];
  }
}

/**
 * Parse API_KEYS="name1:secret1,name2:secret2" into structured format.
 * @param {string} raw
 * @returns {{ name: string, key: string }[]}
 */
export function parseApiKeys(raw) {
  return String(raw || '')
    .split(',')
    .map((pair) => {
      const colonIdx = pair.indexOf(':');
      if (colonIdx === -1) return null;
      const name = pair.slice(0, colonIdx).trim();
      const key  = pair.slice(colonIdx + 1).trim();
      return name && key ? { name, key } : null;
    })
    .filter(Boolean);
}
