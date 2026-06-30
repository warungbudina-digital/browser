/**
 * Scroll position tracker — pure class, no browser dependency.
 *
 * Records scroll position snapshots taken from page.evaluate().
 * Snapshot schema: { x: number, y: number, at: ISO }
 */

export class ScrollManager {
  #snapshots = [];

  /**
   * Record a scroll position snapshot.
   * @param {number} x
   * @param {number} y
   * @returns {{ x: number, y: number, at: string }}
   */
  record(x, y) {
    const xn = Number(x);
    const yn = Number(y);
    if (!Number.isFinite(xn) || xn < 0) throw new Error('x must be a non-negative number');
    if (!Number.isFinite(yn) || yn < 0) throw new Error('y must be a non-negative number');
    const entry = { x: Math.round(xn), y: Math.round(yn), at: new Date().toISOString() };
    this.#snapshots.push(entry);
    return { ...entry };
  }

  /**
   * Return all recorded snapshots (copies).
   * @returns {{ x: number, y: number, at: string }[]}
   */
  list() {
    return this.#snapshots.map((s) => ({ ...s }));
  }

  /**
   * Return the most recent snapshot, or null if none.
   */
  last() {
    return this.#snapshots.length > 0
      ? { ...this.#snapshots[this.#snapshots.length - 1] }
      : null;
  }

  /**
   * Calculate scroll delta between two snapshots.
   * @param {{ x: number, y: number }} a
   * @param {{ x: number, y: number }} b
   * @returns {{ dx: number, dy: number }}
   */
  diff(a, b) {
    return { dx: b.x - a.x, dy: b.y - a.y };
  }

  /**
   * Summarize all recorded snapshots.
   * @returns {{ count, maxX, maxY, minX, minY, first, last }}
   */
  summarize() {
    if (this.#snapshots.length === 0) {
      return { count: 0, maxX: 0, maxY: 0, minX: 0, minY: 0, first: null, last: null };
    }
    let maxX = -Infinity, maxY = -Infinity, minX = Infinity, minY = Infinity;
    for (const s of this.#snapshots) {
      if (s.x > maxX) maxX = s.x;
      if (s.y > maxY) maxY = s.y;
      if (s.x < minX) minX = s.x;
      if (s.y < minY) minY = s.y;
    }
    return {
      count: this.#snapshots.length,
      maxX, maxY, minX, minY,
      first: { ...this.#snapshots[0] },
      last:  { ...this.#snapshots[this.#snapshots.length - 1] },
    };
  }

  /** Remove all snapshots. */
  clear() {
    this.#snapshots = [];
  }

  /** Number of recorded snapshots. */
  get size() { return this.#snapshots.length; }
}
