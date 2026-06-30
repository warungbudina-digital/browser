/**
 * HTML media element utilities — pure functions, no browser dependency.
 *
 * Element schema:
 *   { tag: 'audio'|'video', index: number, src: string,
 *     currentTime: number, duration: number, paused: boolean,
 *     ended: boolean, muted: boolean, volume: number, readyState: number }
 */

/**
 * Filter elements by tag ('audio' or 'video').
 * @param {{ tag: string }[]} elements
 * @param {'audio'|'video'} tag
 */
export function filterByTag(elements, tag) {
  return elements.filter((e) => e.tag === tag);
}

/**
 * Filter elements by playback state.
 * @param {{ paused: boolean, ended: boolean }[]} elements
 * @param {'playing'|'paused'|'ended'} state
 */
export function filterByState(elements, state) {
  if (state === 'playing') return elements.filter((e) => !e.paused && !e.ended);
  if (state === 'paused')  return elements.filter((e) => e.paused && !e.ended);
  if (state === 'ended')   return elements.filter((e) => e.ended);
  return [];
}

/**
 * Return only muted elements.
 * @param {{ muted: boolean }[]} elements
 */
export function filterMuted(elements) {
  return elements.filter((e) => e.muted);
}

/**
 * Summarize all media elements on the page.
 * @param {{ tag: string, paused: boolean, ended: boolean, muted: boolean }[]} elements
 * @returns {{ total: number, playing: number, paused: number, ended: number, muted: number, audio: number, video: number }}
 */
export function summarize(elements) {
  let playing = 0, paused = 0, ended = 0, muted = 0, audio = 0, video = 0;
  for (const e of elements) {
    if (e.tag === 'audio') audio++;
    if (e.tag === 'video') video++;
    if (e.ended)                   ended++;
    else if (!e.paused)            playing++;
    else                           paused++;
    if (e.muted)                   muted++;
  }
  return { total: elements.length, playing, paused, ended, muted, audio, video };
}
