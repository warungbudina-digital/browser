/**
 * Per-domain rate limiter.
 * Memastikan request ke domain yang sama tidak terlalu cepat —
 * interval acak antara minMs dan maxMs agar tidak tampak seperti bot.
 */
export class RateLimiter {
  #lastHit = new Map(); // hostname → timestamp (ms)
  #minMs;
  #maxMs;

  constructor({ minMs = 800, maxMs = 2500 } = {}) {
    this.#minMs = minMs;
    this.#maxMs = maxMs;
  }

  async throttle(url) {
    let hostname;
    try {
      hostname = new URL(url).hostname;
    } catch {
      return; // URL tidak valid, skip throttle
    }

    const now = Date.now();
    const last = this.#lastHit.get(hostname) ?? 0;
    const interval = this.#minMs + Math.random() * (this.#maxMs - this.#minMs);
    const wait = interval - (now - last);

    if (wait > 0) await new Promise((r) => setTimeout(r, Math.floor(wait)));
    this.#lastHit.set(hostname, Date.now());
  }

  /** Reset semua tracking (berguna saat ganti proxy/session) */
  reset() {
    this.#lastHit.clear();
  }
}
