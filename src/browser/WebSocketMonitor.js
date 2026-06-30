/**
 * WebSocket frame filter utilities — pure functions, no browser dependency.
 *
 * Frame schema: { url: string, type: 'send'|'receive', data: string, at: ISO }
 */

export const VALID_FRAME_TYPES = Object.freeze(new Set(['send', 'receive']));

/**
 * Filter frames by type ('send' or 'receive').
 * @param {{ type: string }[]} frames
 * @param {string} type
 */
export function filterByType(frames, type) {
  if (!VALID_FRAME_TYPES.has(type)) throw new Error(`Invalid type: "${type}". Valid: send, receive`);
  return frames.filter((f) => f.type === type);
}

/**
 * Filter frames by WebSocket URL.
 * Accepts a substring string or RegExp.
 * @param {{ url: string }[]} frames
 * @param {string|RegExp} pattern
 */
export function filterByUrl(frames, pattern) {
  if (pattern instanceof RegExp) return frames.filter((f) => pattern.test(f.url));
  return frames.filter((f) => f.url.includes(String(pattern)));
}

/**
 * Filter frames whose data contains the given substring or matches a RegExp.
 * @param {{ data: string }[]} frames
 * @param {string|RegExp} pattern
 */
export function filterByData(frames, pattern) {
  if (pattern instanceof RegExp) return frames.filter((f) => pattern.test(f.data));
  return frames.filter((f) => f.data.includes(String(pattern)));
}

/**
 * Keep only frames at or after the given ISO timestamp.
 * @param {{ at: string }[]} frames
 * @param {string} iso
 */
export function filterSince(frames, iso) {
  const ts = new Date(iso).getTime();
  return frames.filter((f) => new Date(f.at).getTime() >= ts);
}

/**
 * Keep only frames strictly before the given ISO timestamp.
 * @param {{ at: string }[]} frames
 * @param {string} iso
 */
export function filterBefore(frames, iso) {
  const ts = new Date(iso).getTime();
  return frames.filter((f) => new Date(f.at).getTime() < ts);
}

/**
 * Group frames by WebSocket URL.
 * @param {{ url: string }[]} frames
 * @returns {Object.<string, object[]>}
 */
export function groupByUrl(frames) {
  const groups = {};
  for (const frame of frames) {
    if (!groups[frame.url]) groups[frame.url] = [];
    groups[frame.url].push(frame);
  }
  return groups;
}

/**
 * Summarize a frame list.
 * @param {{ url: string, type: string, at: string }[]} frames
 * @returns {{ total, sent, received, urls: string[], first, last }}
 */
export function summarize(frames) {
  const sent     = frames.filter((f) => f.type === 'send').length;
  const received = frames.filter((f) => f.type === 'receive').length;
  const urlSet   = new Set(frames.map((f) => f.url));
  return {
    total:    frames.length,
    sent,
    received,
    urls:     [...urlSet],
    first:    frames.length > 0 ? frames[0]  : null,
    last:     frames.length > 0 ? frames[frames.length - 1] : null,
  };
}

/**
 * Format frames as human-readable text lines.
 * @param {{ url: string, type: string, data: string, at: string }[]} frames
 * @param {{ timestamps?: boolean }} opts
 * @returns {string}
 */
export function formatText(frames, { timestamps = false } = {}) {
  return frames.map((f) => {
    const dir = f.type === 'send' ? '→' : '←';
    if (timestamps) {
      const t = new Date(f.at);
      const hms = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}`;
      return `[${hms}] ${dir} ${f.data}`;
    }
    return `${dir} ${f.data}`;
  }).join('\n');
}
