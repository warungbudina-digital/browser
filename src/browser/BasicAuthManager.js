/**
 * HTTP Basic authentication credential store.
 * Pure class — no browser dependency.
 *
 * Credentials are matched against request URLs using glob/RegExp patterns
 * (same engine as InterceptManager). When a URL matches, the manager
 * provides a pre-encoded Authorization header value.
 *
 * Passwords are never returned by list() or match() — only the Base64 token.
 */
import { matchesPattern } from './InterceptManager.js';

export function encodeCredentials(username, password) {
  return Buffer.from(`${username}:${password}`).toString('base64');
}

export class BasicAuthManager {
  #credentials = [];
  #nextId      = 1;

  /**
   * Add a credential rule.
   * @param {{ pattern: string|RegExp, username: string, password: string }} opts
   * @returns {{ id: number, pattern, username }}
   */
  add({ pattern, username, password } = {}) {
    if (pattern == null) throw new Error('pattern is required');
    if (typeof username !== 'string' || !username) throw new Error('username must be a non-empty string');
    if (typeof password !== 'string') throw new Error('password must be a string');
    const token = encodeCredentials(username, password);
    const entry = { id: this.#nextId++, pattern, username, token };
    this.#credentials.push(entry);
    return { id: entry.id, pattern: entry.pattern, username: entry.username };
  }

  /**
   * Remove a credential by id.
   * @param {number} id
   * @returns {boolean}
   */
  remove(id) {
    const before = this.#credentials.length;
    this.#credentials = this.#credentials.filter((c) => c.id !== id);
    return this.#credentials.length < before;
  }

  /**
   * Find the first credential whose pattern matches the URL.
   * Returns { username, token } or null.
   * @param {string} url
   * @returns {{ username: string, token: string }|null}
   */
  match(url) {
    const entry = this.#credentials.find((c) => matchesPattern(c.pattern, url));
    return entry ? { username: entry.username, token: entry.token } : null;
  }

  /**
   * List all credentials (passwords omitted).
   * @returns {{ id: number, pattern, username: string }[]}
   */
  list() {
    return this.#credentials.map(({ id, pattern, username }) => ({ id, pattern, username }));
  }

  /** Remove all credentials. */
  clear() {
    this.#credentials = [];
  }

  /** Number of stored credentials. */
  get size() { return this.#credentials.length; }
}
