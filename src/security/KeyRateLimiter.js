/**
 * KeyRateLimiter — sliding-window rate limiter per API key.
 *
 * Dua jendela independen:
 *   - rpm  (requests per minute)
 *   - rph  (requests per hour)
 *
 * Jika salah satu terlampaui, request ditolak.
 * Tidak memerlukan Redis — state disimpan in-process.
 */
export class KeyRateLimiter {
  #rpm;
  #rph;
  /** @type {Map<string, number[]>} key → sorted timestamp array (ms) */
  #log = new Map();

  constructor({ rpm = 60, rph = 1000 } = {}) {
    this.#rpm = rpm;
    this.#rph = rph;
  }

  /**
   * Check & consume one request slot for the given key.
   * Returns info regardless of whether request is allowed.
   *
   * @param {string} key
   * @returns {{ allowed: boolean, remaining: number, resetAt: number }}
   */
  consume(key) {
    const now = Date.now();
    const log = this.#log.get(key) ?? [];

    // Prune entries older than 1 hour
    const hourAgo   = now - 3_600_000;
    const minuteAgo = now - 60_000;
    const pruned    = log.filter((t) => t > hourAgo);

    const usedLastMinute = pruned.filter((t) => t > minuteAgo).length;
    const usedLastHour   = pruned.length;

    if (usedLastMinute >= this.#rpm || usedLastHour >= this.#rph) {
      this.#log.set(key, pruned);
      // resetAt = when the oldest entry in the blocking window expires
      const blockingWindow = usedLastMinute >= this.#rpm
        ? pruned.filter((t) => t > minuteAgo)
        : pruned;
      const resetAt = blockingWindow.length > 0 ? blockingWindow[0] + (usedLastMinute >= this.#rpm ? 60_000 : 3_600_000) : now + 60_000;
      return { allowed: false, remaining: 0, resetAt };
    }

    pruned.push(now);
    this.#log.set(key, pruned);

    const usedNowMinute = pruned.filter((t) => t > minuteAgo).length;
    const usedNowHour   = pruned.length;
    const remaining = Math.min(this.#rpm - usedNowMinute, this.#rph - usedNowHour);
    const resetAt   = pruned.filter((t) => t > minuteAgo)[0] + 60_000;

    return { allowed: true, remaining: Math.max(0, remaining), resetAt };
  }

  /**
   * Snapshot of current usage per key.
   * @returns {Record<string, { minuteUsed, hourUsed, rpmLimit, rphLimit }>}
   */
  status() {
    const now  = Date.now();
    const out  = {};
    for (const [key, log] of this.#log) {
      const minuteUsed = log.filter((t) => now - t < 60_000).length;
      const hourUsed   = log.filter((t) => now - t < 3_600_000).length;
      if (minuteUsed === 0 && hourUsed === 0) continue;
      out[key] = { minuteUsed, hourUsed, rpmLimit: this.#rpm, rphLimit: this.#rph };
    }
    return out;
  }
}
