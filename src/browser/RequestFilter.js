/**
 * Network request filter utilities — pure, no browser dependency.
 *
 * Request entry shape (from BrowserService):
 *   { method: string, url: string, status: number|null, at: ISO-8601 string }
 *
 * status is null when the request failed before receiving a response.
 */

/** Common HTTP methods for reference. */
export const VALID_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'CONNECT', 'TRACE']);

/**
 * Filter requests by HTTP method.
 * @param {object[]}        requests
 * @param {string|string[]} method   Single method or array (e.g. 'GET' or ['GET','POST'])
 * @returns {object[]} shallow copies
 */
export function filterByMethod(requests, method) {
  const methods = Array.isArray(method) ? method : [method];
  return requests.filter((r) => methods.includes(r.method)).map((r) => ({ ...r }));
}

/**
 * Filter requests by URL.
 * String → substring match; RegExp → test against url.
 * @param {object[]}      requests
 * @param {string|RegExp} pattern
 * @returns {object[]} shallow copies
 */
export function filterByUrl(requests, pattern) {
  if (pattern instanceof RegExp) return requests.filter((r) => pattern.test(r.url)).map((r) => ({ ...r }));
  return requests.filter((r) => r.url.includes(String(pattern))).map((r) => ({ ...r }));
}

/**
 * Filter requests by exact HTTP status code.
 * Requests with null status are excluded.
 * @param {object[]}      requests
 * @param {number|number[]} status
 * @returns {object[]} shallow copies
 */
export function filterByStatus(requests, status) {
  const statuses = Array.isArray(status) ? status : [status];
  return requests.filter((r) => r.status != null && statuses.includes(r.status)).map((r) => ({ ...r }));
}

/**
 * Filter requests whose status falls within [min, max] inclusive.
 * Requests with null status are excluded.
 * @param {object[]} requests
 * @param {number}   min
 * @param {number}   max
 * @returns {object[]} shallow copies
 */
export function filterByStatusRange(requests, min, max) {
  return requests.filter((r) => r.status != null && r.status >= min && r.status <= max).map((r) => ({ ...r }));
}

/**
 * Filter requests at or after the given ISO timestamp.
 * @param {object[]} requests
 * @param {string}   since   ISO-8601 string
 * @returns {object[]} shallow copies
 */
export function filterSince(requests, since) {
  const s = String(since);
  return requests.filter((r) => r.at >= s).map((r) => ({ ...r }));
}

/**
 * Filter requests strictly before the given ISO timestamp.
 * @param {object[]} requests
 * @param {string}   before  ISO-8601 string
 * @returns {object[]} shallow copies
 */
export function filterBefore(requests, before) {
  const b = String(before);
  return requests.filter((r) => r.at < b).map((r) => ({ ...r }));
}

/**
 * Group requests by HTTP method.
 * @param {object[]} requests
 * @returns {Object.<string, object[]>}
 */
export function groupByMethod(requests) {
  const groups = {};
  for (const r of requests) {
    if (!groups[r.method]) groups[r.method] = [];
    groups[r.method].push({ ...r });
  }
  return groups;
}

/**
 * Group requests by status code (as string key).
 * Requests with null status are grouped under the key 'null'.
 * @param {object[]} requests
 * @returns {Object.<string, object[]>}
 */
export function groupByStatus(requests) {
  const groups = {};
  for (const r of requests) {
    const key = String(r.status);
    if (!groups[key]) groups[key] = [];
    groups[key].push({ ...r });
  }
  return groups;
}

/**
 * Aggregate stats for a set of request entries.
 * "failed" = status >= 400 (null-status entries counted separately as nullStatus).
 * @param {object[]} requests
 * @returns {{ total, byMethod, byStatus, failed, nullStatus, first, last }}
 */
export function summarize(requests) {
  const byMethod = {};
  const byStatus = {};
  let failed     = 0;
  let nullStatus = 0;
  let first      = null;
  let last       = null;

  for (const r of requests) {
    byMethod[r.method] = (byMethod[r.method] || 0) + 1;

    if (r.status == null) {
      nullStatus++;
    } else {
      const key = String(r.status);
      byStatus[key] = (byStatus[key] || 0) + 1;
      if (r.status >= 400) failed++;
    }

    if (first === null || r.at < first) first = r.at;
    if (last  === null || r.at > last)  last  = r.at;
  }

  return { total: requests.length, byMethod, byStatus, failed, nullStatus, first, last };
}

/**
 * Format requests as a plain-text log string.
 * Each line: `METHOD STATUS url`  (null status rendered as '-')
 * @param {object[]} requests
 * @returns {string}
 */
export function formatText(requests) {
  return requests.map((r) => {
    const method = String(r.method || '').padEnd(7);
    const status = r.status != null ? String(r.status) : '-';
    return `${method} ${status} ${r.url}`;
  }).join('\n');
}
