/**
 * AuditLogger — in-memory ring-buffer untuk semua API request.
 *
 * Setiap entry: { ts, keyName, method, path, status, durationMs, ip, error? }
 * Dibatasi maxSize entry (entri lama di-evict secara FIFO).
 */
export class AuditLogger {
  #entries = [];
  #maxSize;
  #eventBus; // EventBus | null — null by default untuk hindari noise tinggi

  constructor({ maxSize = 5000, eventBus = null } = {}) {
    this.#maxSize  = maxSize;
    this.#eventBus = eventBus;
  }

  /**
   * Record a completed request.
   * @param {{ keyName?: string, method: string, path: string, status: number, durationMs: number, ip?: string, error?: string }} entry
   */
  log(entry) {
    const full = { ts: Date.now(), ...entry };
    this.#entries.push(full);
    if (this.#entries.length > this.#maxSize) {
      this.#entries.splice(0, this.#entries.length - this.#maxSize);
    }
    // Hanya emit ke SSE jika ada error (status >= 400) — hindari banjir event untuk request OK
    if (this.#eventBus && full.status >= 400) {
      this.#eventBus.publish('audit.error', full);
    }
  }

  /**
   * Query audit entries (newest-first).
   * @param {{ keyName?: string, status?: 'ok'|'error', limit?: number, offset?: number, since?: number, until?: number }}
   * @returns {{ total: number, items: object[] }}
   */
  query({ keyName, status, limit = 100, offset = 0, since, until } = {}) {
    let filtered = this.#entries;
    if (keyName) filtered = filtered.filter((e) => e.keyName === keyName);
    if (status === 'ok')    filtered = filtered.filter((e) => e.status < 400);
    if (status === 'error') filtered = filtered.filter((e) => e.status >= 400);
    if (since != null) filtered = filtered.filter((e) => e.ts >= since);
    if (until != null) filtered = filtered.filter((e) => e.ts <= until);

    const total = filtered.length;
    // Return newest-first slice
    const reversed = filtered.slice().reverse();
    const items = reversed.slice(offset, offset + limit);
    return { total, items };
  }

  /**
   * Per-key aggregate stats.
   * @returns {Record<string, { total, success, error, avgDurationMs }>}
   */
  stats() {
    const out = {};
    for (const e of this.#entries) {
      const k = e.keyName ?? 'anonymous';
      if (!out[k]) out[k] = { total: 0, success: 0, error: 0, _durSum: 0 };
      out[k].total++;
      if (e.status < 400) out[k].success++;
      else out[k].error++;
      out[k]._durSum += e.durationMs ?? 0;
    }
    for (const k of Object.keys(out)) {
      const { total, _durSum, ...rest } = out[k];
      out[k] = { ...rest, total, avgDurationMs: total > 0 ? +(_durSum / total).toFixed(1) : 0 };
    }
    return out;
  }

  /** Total number of stored entries. */
  size() {
    return this.#entries.length;
  }
}
