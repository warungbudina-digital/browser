/**
 * HTTP request header injection rules — add custom headers to outgoing requests.
 * Pure class, no browser dependency.
 *
 * Rules are priority-sorted (higher number = applied first).
 * When multiple rules match a URL, their headers are merged; higher-priority
 * rules override lower-priority ones for the same header key.
 *
 * Applied in BrowserService's route handler via route.continue({ headers }).
 */
import { matchesPattern } from './InterceptManager.js';

export class HeaderRuleManager {
  #rules  = [];
  #nextId = 1;

  /**
   * Add a header injection rule.
   * @param {{ pattern: string|RegExp, headers: Object.<string,string>, priority?: number }} opts
   * @returns {{ id, pattern, headers, priority }}
   */
  add({ pattern, headers, priority = 0 } = {}) {
    if (pattern == null) throw new Error('pattern is required');
    if (headers == null || typeof headers !== 'object' || Array.isArray(headers)) {
      throw new Error('headers must be a non-null object');
    }
    const entries = Object.entries(headers);
    if (entries.length === 0) throw new Error('headers cannot be empty');
    for (const [k, v] of entries) {
      if (typeof k !== 'string' || !k.trim()) throw new Error('header keys must be non-empty strings');
      if (typeof v !== 'string') throw new Error('header values must be strings');
    }
    const rule = {
      id:       this.#nextId++,
      pattern,
      headers:  { ...headers },
      priority: Number(priority),
    };
    this.#rules.push(rule);
    this.#rules.sort((a, b) => b.priority - a.priority);
    return { ...rule, headers: { ...rule.headers } };
  }

  /**
   * Return merged headers from all rules that match the given URL.
   * Higher-priority rules override lower-priority ones for the same key.
   * Returns null if no rules match.
   * @param {string} url
   * @returns {Object.<string,string>|null}
   */
  match(url) {
    const matching = this.#rules.filter((r) => matchesPattern(r.pattern, url));
    if (matching.length === 0) return null;
    const merged = {};
    // Apply from lowest priority to highest so higher-priority wins
    for (const r of [...matching].reverse()) Object.assign(merged, r.headers);
    return merged;
  }

  /**
   * List all rules (copies — mutations do not affect stored rules).
   * @returns {object[]}
   */
  list() {
    return this.#rules.map((r) => ({ ...r, headers: { ...r.headers } }));
  }

  /**
   * Remove a rule by id.
   * @param {number} id
   * @returns {boolean} true if removed, false if not found
   */
  remove(id) {
    const before = this.#rules.length;
    this.#rules = this.#rules.filter((r) => r.id !== id);
    return this.#rules.length < before;
  }

  /** Remove all rules. */
  clear() {
    this.#rules = [];
  }

  /** Number of active rules. */
  get size() { return this.#rules.length; }
}
