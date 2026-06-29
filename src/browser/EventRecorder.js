import crypto from 'node:crypto';

export const VALID_KINDS = new Set([
  'navigate', 'click', 'type', 'fill', 'press',
  'hover', 'select', 'scroll', 'dialog', 'download', 'error', 'custom',
]);

// Kinds that map 1:1 to act steps (used by toScript)
const SCRIPT_KINDS = new Set(['click', 'type', 'fill', 'press', 'hover', 'select']);

/**
 * In-memory recorder of browser page interaction events.
 *
 * Auto-records navigate and act events when integrated into BrowserService.
 * Call toScript() to export as a ScriptRunner-compatible step array for replay.
 */
export class EventRecorder {
  #events = [];

  /**
   * Record one event.
   *
   * @param {string} targetId   Page identifier (required)
   * @param {object} opts
   * @param {string} opts.kind  Event kind — must be in VALID_KINDS
   * @param {string} [opts.at]  ISO timestamp (defaults to now)
   * @param {*}      [...rest]  Kind-specific detail fields
   * @returns {object} Snapshot of the stored event
   */
  record(targetId, { kind, at, ...details } = {}) {
    if (targetId == null || targetId === '') throw new Error('targetId is required');
    if (!kind) throw new Error('kind is required');
    if (!VALID_KINDS.has(kind)) {
      throw new Error(`kind must be one of: ${[...VALID_KINDS].join(', ')}`);
    }
    const event = {
      id:       crypto.randomUUID(),
      targetId: String(targetId),
      kind,
      ...details,
      at:       at || new Date().toISOString(),
    };
    this.#events.push(event);
    return { ...event };
  }

  /**
   * Query recorded events with optional filtering.
   *
   * @param {object} [opts]
   * @param {string} [opts.targetId]  Filter to specific page
   * @param {string} [opts.kind]      Filter to specific event kind
   * @param {string} [opts.since]     ISO timestamp — only events at or after this time
   * @param {number} [opts.limit]     Max events to return (from beginning)
   * @returns {object[]} Shallow copies of matching events
   */
  list({ targetId, kind, since, limit } = {}) {
    let events = this.#events;
    if (targetId) events = events.filter((e) => e.targetId === targetId);
    if (kind)     events = events.filter((e) => e.kind === kind);
    if (since)    events = events.filter((e) => e.at >= since);
    if (limit > 0) events = events.slice(0, limit);
    return events.map((e) => ({ ...e }));
  }

  /**
   * Export events as a ScriptRunner-compatible step array.
   * Only event kinds with a direct 1:1 act mapping are included
   * (navigate, dialog, download, error, custom are skipped).
   *
   * @param {string} [targetId]  Limit to a specific page (all pages if omitted)
   * @returns {{ steps: object[] }}
   */
  toScript(targetId) {
    const events = targetId
      ? this.#events.filter((e) => e.targetId === targetId)
      : this.#events;
    const steps = events
      .filter((e) => SCRIPT_KINDS.has(e.kind))
      .map((e) => this.#toStep(e));
    return { steps };
  }

  /**
   * Remove all events for a specific targetId.
   *
   * @param {string} targetId
   * @returns {number} Count of removed events
   */
  clear(targetId) {
    if (targetId == null || targetId === '') {
      throw new Error('targetId is required; use clearAll() to remove all events');
    }
    const before = this.#events.length;
    this.#events = this.#events.filter((e) => e.targetId !== targetId);
    return before - this.#events.length;
  }

  /** Remove all events. Returns total count removed. */
  clearAll() {
    const count = this.#events.length;
    this.#events = [];
    return count;
  }

  /** Total number of recorded events across all pages. */
  get size() { return this.#events.length; }

  /** Number of recorded events for a specific targetId. */
  sizeFor(targetId) {
    return this.#events.filter((e) => e.targetId === targetId).length;
  }

  #toStep(event) {
    const { kind, selector, ref, text, key, fields, values } = event;
    switch (kind) {
      case 'click':  return { kind, selector, ref };
      case 'type':   return { kind, selector, ref, text };
      case 'fill':   return { kind, fields: fields || [] };
      case 'press':  return { kind, key };
      case 'hover':  return { kind, selector, ref };
      case 'select': return { kind, selector, ref, values };
      default:       return { kind };
    }
  }
}
