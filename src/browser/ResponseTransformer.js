import crypto from 'node:crypto';
import { matchesPattern } from './InterceptManager.js';

export const VALID_OPS = new Set([
  'set-status', 'set-header', 'remove-header',
  'replace-body', 'prepend-body', 'append-body',
]);

/**
 * Rule-based HTTP response transformer.
 *
 * Unlike InterceptManager (which blocks or fully mocks), ResponseTransformer
 * fetches the real response and surgically modifies it — changing status codes,
 * injecting/removing headers, or rewriting body content.
 *
 * Rules are sorted by priority (desc). First matching rule wins.
 */
export class ResponseTransformer {
  #rules = [];

  /**
   * Add a transform rule.
   *
   * @param {object}          opts
   * @param {string|RegExp}   opts.pattern     URL pattern (glob or RegExp)
   * @param {object[]}        opts.transforms  One or more transform ops (must be non-empty)
   * @param {number}          [opts.priority]  Higher = evaluated first (default 0)
   * @returns {object} Saved rule snapshot
   */
  add({ pattern, transforms, priority = 0 } = {}) {
    if (pattern == null) throw new Error('pattern is required');
    if (typeof pattern !== 'string' && !(pattern instanceof RegExp)) {
      throw new Error('pattern must be a string or RegExp');
    }
    if (!Array.isArray(transforms) || transforms.length === 0) {
      throw new Error('transforms must be a non-empty array');
    }
    for (const t of transforms) {
      if (!VALID_OPS.has(t.op)) {
        throw new Error(`invalid transform op: "${t.op}". Valid: ${[...VALID_OPS].join(', ')}`);
      }
    }
    const rule = {
      id:         crypto.randomUUID(),
      pattern,
      transforms: transforms.map((t) => ({ ...t })),
      priority:   Number(priority) || 0,
      hits:       0,
      addedAt:    new Date().toISOString(),
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
  clear() { this.#rules = []; }

  /** Return a sorted copy of all rules. */
  list() { return this.#rules.map((r) => this.#snapshot(r)); }

  get size() { return this.#rules.length; }

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
    return { ...rule, transforms: rule.transforms.map((t) => ({ ...t })) };
  }
}

/**
 * Apply a list of transform ops to a response spec.
 * Pure function — does NOT mutate the input object.
 *
 * @param {object[]} transforms  Array of op objects
 * @param {{ status: number, headers: object, body: string }} response
 * @returns {{ status: number, headers: object, body: string }}
 */
export function applyTransforms(transforms, response) {
  let { status, body } = response;
  const headers = { ...response.headers };

  for (const t of transforms) {
    switch (t.op) {
      case 'set-status':
        status = Number(t.status);
        break;
      case 'set-header':
        headers[String(t.key).toLowerCase()] = String(t.value);
        break;
      case 'remove-header':
        delete headers[String(t.key).toLowerCase()];
        break;
      case 'replace-body':
        body = String(t.body ?? '');
        break;
      case 'prepend-body':
        body = String(t.body ?? '') + body;
        break;
      case 'append-body':
        body = body + String(t.body ?? '');
        break;
    }
  }

  return { status, headers, body };
}
