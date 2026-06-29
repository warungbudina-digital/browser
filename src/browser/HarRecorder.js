import crypto from 'node:crypto';

const CREATOR = { name: 'full-tool-browser', version: '0.2.0' };

const STATUS_TEXT = {
  200: 'OK', 201: 'Created', 202: 'Accepted', 204: 'No Content',
  301: 'Moved Permanently', 302: 'Found', 304: 'Not Modified',
  400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden',
  404: 'Not Found', 405: 'Method Not Allowed', 409: 'Conflict',
  429: 'Too Many Requests', 500: 'Internal Server Error',
  502: 'Bad Gateway', 503: 'Service Unavailable',
};

/**
 * In-memory HTTP Archive (HAR 1.2) recorder.
 *
 * Entries are stored per targetId. Call toHAR() to export a spec-compliant
 * HAR object suitable for serialisation or replay tools.
 */
export class HarRecorder {
  #entries = [];

  /**
   * Record one request/response pair.
   *
   * @param {object} opts
   * @param {string} opts.targetId          Page identifier (required)
   * @param {string} opts.method            HTTP method (required, auto-uppercased)
   * @param {string} opts.url               Request URL (required)
   * @param {number} [opts.status]          HTTP response status (-1 if unknown)
   * @param {string} [opts.mimeType]        Response content-type
   * @param {Array}  [opts.requestHeaders]  [{name, value}]
   * @param {Array}  [opts.responseHeaders] [{name, value}]
   * @param {number} [opts.bodySize]        Response body size in bytes (-1 if unknown)
   * @param {number} [opts.timeMs]          Total elapsed time in ms (-1 if unknown)
   * @param {string} [opts.startedAt]       ISO timestamp (defaults to now)
   * @returns {object} Snapshot of the stored entry
   */
  add({
    targetId, method, url,
    status = -1, mimeType = 'application/octet-stream',
    requestHeaders = [], responseHeaders = [],
    bodySize = -1, timeMs = -1, startedAt,
  } = {}) {
    if (targetId == null || targetId === '') throw new Error('targetId is required');
    if (!method) throw new Error('method is required');
    if (!url) throw new Error('url is required');

    const entry = {
      id:              crypto.randomUUID(),
      targetId:        String(targetId),
      method:          String(method).toUpperCase(),
      url:             String(url),
      status:          Number.isFinite(status) ? status : -1,
      mimeType:        String(mimeType || 'application/octet-stream'),
      requestHeaders:  this.#normalizeHeaders(requestHeaders),
      responseHeaders: this.#normalizeHeaders(responseHeaders),
      bodySize:        Number.isFinite(bodySize) ? bodySize : -1,
      timeMs:          Number.isFinite(timeMs) ? timeMs : -1,
      startedAt:       startedAt || new Date().toISOString(),
    };
    this.#entries.push(entry);
    return { ...entry };
  }

  /**
   * List recorded entries with optional filtering.
   *
   * @param {object} [opts]
   * @param {string} [opts.targetId]  Filter to specific page
   * @param {string} [opts.urlFilter] Substring match against url
   * @param {number} [opts.limit]     Max entries to return (from beginning)
   * @returns {object[]} Shallow copies of matching entries
   */
  list({ targetId, urlFilter, limit } = {}) {
    let entries = this.#entries;
    if (targetId) entries = entries.filter((e) => e.targetId === targetId);
    if (urlFilter) entries = entries.filter((e) => e.url.includes(urlFilter));
    if (limit > 0) entries = entries.slice(0, limit);
    return entries.map((e) => ({ ...e }));
  }

  /**
   * Export entries as a HAR 1.2 object.
   *
   * @param {object} [opts]
   * @param {string} [opts.targetId] Limit to a specific page
   * @returns {{ log: object }} HAR document
   */
  toHAR({ targetId } = {}) {
    const entries = targetId
      ? this.#entries.filter((e) => e.targetId === targetId)
      : this.#entries;
    return {
      log: {
        version: '1.2',
        creator: { ...CREATOR },
        entries: entries.map((e) => this.#toHarEntry(e)),
      },
    };
  }

  /**
   * Remove all entries for a specific targetId.
   *
   * @param {string} targetId
   * @returns {number} Count of removed entries
   */
  clear(targetId) {
    if (targetId == null || targetId === '') {
      throw new Error('targetId is required; use clearAll() to remove all entries');
    }
    const before = this.#entries.length;
    this.#entries = this.#entries.filter((e) => e.targetId !== targetId);
    return before - this.#entries.length;
  }

  /** Remove all entries. Returns total count removed. */
  clearAll() {
    const count = this.#entries.length;
    this.#entries = [];
    return count;
  }

  /** Total number of recorded entries across all pages. */
  get size() { return this.#entries.length; }

  /** Number of recorded entries for a specific targetId. */
  sizeFor(targetId) {
    return this.#entries.filter((e) => e.targetId === targetId).length;
  }

  #normalizeHeaders(headers) {
    if (!Array.isArray(headers)) return [];
    return headers.map((h) => ({ name: String(h.name), value: String(h.value) }));
  }

  #toHarEntry(e) {
    return {
      startedDateTime: e.startedAt,
      time:            e.timeMs,
      request: {
        method:      e.method,
        url:         e.url,
        httpVersion: 'HTTP/1.1',
        headers:     e.requestHeaders,
        queryString: this.#parseQuery(e.url),
        cookies:     [],
        headersSize: -1,
        bodySize:    -1,
      },
      response: {
        status:      e.status,
        statusText:  STATUS_TEXT[e.status] || '',
        httpVersion: 'HTTP/1.1',
        headers:     e.responseHeaders,
        cookies:     [],
        content: {
          size:     e.bodySize,
          mimeType: e.mimeType,
        },
        redirectURL: '',
        headersSize: -1,
        bodySize:    e.bodySize,
      },
      cache:   {},
      timings: {
        send:    0,
        wait:    Math.max(0, e.timeMs),
        receive: 0,
      },
    };
  }

  #parseQuery(url) {
    try {
      return [...new URL(url).searchParams.entries()].map(([name, value]) => ({ name, value }));
    } catch {
      return [];
    }
  }
}
