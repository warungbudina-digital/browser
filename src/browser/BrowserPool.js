/**
 * BrowserPool — semaphore pool dari N profile browser concurrent.
 *
 * Setiap slot adalah profile terpisah (pool-1, pool-2, …) sehingga
 * setiap job mendapat fingerprint unik (FingerprintManager sudah
 * seed by profile name). Pool profiles dibuat di BrowserManager
 * saat init() dipanggil.
 */
export class BrowserPool {
  #manager;
  #slots;        // [{ profile, busy, jobId }]
  #waiters = []; // [(resolve, reject, timer, jobId)]
  #prefix;
  #cdpUrl;

  get size() { return this.#slots.length; }

  constructor(manager, { size = 3, profilePrefix = 'pool', cdpUrl = null } = {}) {
    this.#manager = manager;
    this.#prefix  = profilePrefix;
    this.#cdpUrl  = cdpUrl;
    this.#slots   = Array.from({ length: size }, (_, i) => ({
      profile: `${profilePrefix}-${i + 1}`,
      busy:    false,
      jobId:   null,
    }));
  }

  /** Pastikan semua pool profile terdaftar di BrowserManager. */
  async init() {
    for (const slot of this.#slots) {
      try {
        await this.#manager.createProfile(
          this.#cdpUrl
            ? { name: slot.profile, driver: 'remote-cdp', cdpUrl: this.#cdpUrl, stealth: true }
            : { name: slot.profile, driver: 'managed', stealth: true }
        );
      } catch (err) {
        // Profile sudah ada dari run sebelumnya — tidak masalah
        if (!err.message?.includes('already exists')) throw err;
      }
    }
  }

  /**
   * Ambil slot kosong. Jika tidak ada, tunggu hingga ada yang dilepas.
   * Throws setelah timeoutMs jika tidak ada slot tersedia.
   */
  async acquire(jobId, timeoutMs = 60_000) {
    const free = this.#slots.find((s) => !s.busy);
    if (free) {
      free.busy  = true;
      free.jobId = jobId;
      return free;
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#waiters = this.#waiters.filter((w) => w.resolve !== resolve);
        reject(new Error(`BrowserPool: tidak ada slot kosong setelah ${timeoutMs}ms`));
      }, timeoutMs);
      this.#waiters.push({ resolve, reject, timer, jobId });
    });
  }

  /** Lepas slot setelah job selesai. Wake up waiter berikutnya jika ada. */
  release(slot) {
    slot.busy  = false;
    slot.jobId = null;

    const next = this.#waiters.shift();
    if (next) {
      clearTimeout(next.timer);
      slot.busy  = true;
      slot.jobId = next.jobId;
      next.resolve(slot);
    }
  }

  /**
   * Restart browser di slot tertentu.
   * Dipanggil jika browser crash saat job berjalan.
   */
  async restartSlot(slot) {
    try { await this.#manager.dispatch('stop', { profile: slot.profile }); } catch {}
    try { await this.#manager.dispatch('start', { profile: slot.profile }); } catch {}
  }

  status() {
    return {
      size:  this.#slots.length,
      busy:  this.#slots.filter((s) => s.busy).length,
      slots: this.#slots.map(({ profile, busy, jobId }) => ({ profile, busy, jobId })),
    };
  }
}
