/**
 * Clipboard operation history utilities — pure functions, no browser dependency.
 *
 * History entry schema: { op: 'read'|'write', text: string, at: string (ISO) }
 */

/**
 * Filter history by operation type ('read' or 'write').
 * @param {{ op: string }[]} history
 * @param {'read'|'write'} op
 */
export function filterByOp(history, op) {
  return history.filter((e) => e.op === op);
}

/**
 * Filter history entries whose text matches a substring or RegExp.
 * @param {{ text: string }[]} history
 * @param {string|RegExp} pattern
 */
export function filterByText(history, pattern) {
  if (pattern instanceof RegExp) return history.filter((e) => pattern.test(e.text));
  return history.filter((e) => e.text.includes(String(pattern)));
}

/**
 * Filter history entries at or after an ISO timestamp.
 * @param {{ at: string }[]} history
 * @param {string} since ISO timestamp
 */
export function filterSince(history, since) {
  const t = new Date(since).getTime();
  return history.filter((e) => new Date(e.at).getTime() >= t);
}

/**
 * Summarize clipboard history.
 * @param {{ op: string, text: string }[]} history
 * @returns {{ count: number, reads: number, writes: number, totalChars: number, lastText: string|null }}
 */
export function summarize(history) {
  let reads = 0;
  let writes = 0;
  let totalChars = 0;
  let lastText = null;
  for (const e of history) {
    if (e.op === 'read')  reads++;
    if (e.op === 'write') writes++;
    totalChars += e.text.length;
    lastText = e.text;
  }
  return { count: history.length, reads, writes, totalChars, lastText };
}
