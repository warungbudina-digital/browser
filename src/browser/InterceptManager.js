import crypto from 'node:crypto';

/**
 * Pure in-memory request intercept rule store.
 *
 * Rules are sorted by priority (desc). The first matching rule wins.
 * Hit counts are tracked so callers can report usage.
 */
export class InterceptManager {
  #rules = [];

  /**
   * Add an intercept rule.
   *
   * @param {object} opts
   * @param {string|RegExp} opts.pattern       URL pattern (glob or RegExp)
   * @param {'block'|'mock'|'passthrough'} opts.action
   * @param {object|null} [opts.response]      Required when action='mock'
   * @param {number} [opts.priority]           Higher = evaluated first (default 0)
   * @returns {object} Saved rule snapshot (with generated id)
   */
  add({ pattern, action, response = null, priority = 0 } = {}) {
    if (pattern == null) throw new Error('pattern is required');
    if (typeof pattern !== 'string' && !(pattern instanceof RegExp)) {
      throw new Error('pattern must be a string or RegExp');
    }
    const valid = ['block', 'mock', 'passthrough'];
    if (!valid.includes(action)) throw new Error(`action must be one of: ${valid.join(', ')}`);
    if (action === 'mock' && response == null) {
      throw new Error('response is required when action is "mock"');
    }
    const rule = {
      id:        crypto.randomUUID(),
      pattern,
      action,
      response:  response ? { ...response } : null,
      priority:  Number(priority) || 0,
      hits:      0,
      addedAt:   new Date().toISOString(),
    };
    this.#rules.push(rule);
    this.#rules.sort((a, b) => b.priority - a.priority);
    return this.#snapshot(rule);
  }

  /** Remove rule by id. Returns true if found and removed. */
  remove(id) {
    const before = this.#rules.length;
    this.#rules = this.#rules.filter((r) => r.id !== id);
    return this.#rules.length < before;
  }

  /** Remove all rules. */
  clear() {
    this.#rules = [];
  }

  /** Return a sorted copy of all rules. */
  list() {
    return this.#rules.map((r) => this.#snapshot(r));
  }

  get size() {
    return this.#rules.length;
  }

  /**
   * Find first rule that matches url and increment its hit counter.
   * Returns null when no rule matches.
   */
  match(url) {
    for (const rule of this.#rules) {
      if (matchesPattern(rule.pattern, url)) {
        rule.hits++;
        return this.#snapshot(rule);
      }
    }
    return null;
  }

  #snapshot(rule) {
    return { ...rule };
  }
}

/**
 * Test whether a URL matches a glob pattern or RegExp.
 *
 * Glob rules:
 *   **  → matches any sequence of characters including "/"
 *   *   → matches any sequence except "/"
 *   ?   → matches exactly one character (any)
 *
 * @param {string|RegExp} pattern
 * @param {string} url
 * @returns {boolean}
 */
export function matchesPattern(pattern, url) {
  if (pattern instanceof RegExp) return pattern.test(url);
  if (typeof pattern !== 'string') return false;

  // Escape all regex metacharacters except * and ?
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');

  // Convert globs: ** first (placeholder), then *, then ?
  const regexStr = escaped
    .replace(/\*\*/g, '\x00')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '.')
    .replace(/\x00/g, '.*');

  try {
    return new RegExp(`^${regexStr}$`).test(url);
  } catch {
    return false;
  }
}
