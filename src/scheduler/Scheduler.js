import cron from 'node-cron';

const TZ = process.env.TZ || 'Asia/Jakarta';

/**
 * Scheduler — mengelola recurring scrape jobs berbasis cron expression.
 * Bergantung pada ScheduleStore (PostgreSQL) dan ScraperService.
 */
export class Scheduler {
  #tasks   = new Map(); // scheduleId → node-cron ScheduledTask
  #store;
  #scraper;

  constructor(scheduleStore, scraperService) {
    this.#store   = scheduleStore;
    this.#scraper = scraperService;
  }

  /** Load semua jadwal aktif dari DB dan daftarkan ke cron engine. */
  async start() {
    const schedules = await this.#store.listEnabled();
    for (const s of schedules) this.#register(s);
    console.log(`[Scheduler] ${schedules.length} jadwal aktif dimuat (TZ: ${TZ})`);
  }

  #register(schedule) {
    // Stop task lama jika ada (reload scenario)
    this.#tasks.get(schedule.id)?.stop();
    this.#tasks.delete(schedule.id);

    if (!cron.validate(schedule.cron_expr)) {
      console.warn(`[Scheduler] Cron expression tidak valid: "${schedule.cron_expr}" (id: ${schedule.id})`);
      return;
    }

    const task = cron.schedule(
      schedule.cron_expr,
      () => this.#execute(schedule),
      { timezone: TZ, scheduled: true }
    );

    this.#tasks.set(schedule.id, task);
  }

  async #execute(schedule) {
    console.log(`[Scheduler] Menjalankan: ${schedule.id} | ${schedule.platform} → ${schedule.target_url}`);
    try {
      await this.#scraper.submit({
        platform:    schedule.platform,
        targetUrl:   schedule.target_url,
        profileName: schedule.profile_name,
        options:     schedule.options ?? {},
        webhookUrl:  schedule.webhook_url,
      });
      await this.#store.touchRun(schedule.id);
    } catch (err) {
      console.error(`[Scheduler] Gagal submit jadwal ${schedule.id}: ${err.message}`);
    }
  }

  /**
   * Reload jadwal (panggil setelah create/update via API).
   * Jika jadwal di-disable atau dihapus, otomatis di-unregister.
   */
  async reload(id) {
    const s = await this.#store.get(id);
    if (!s || !s.enabled) {
      this.unregister(id);
      return;
    }
    this.#register(s);
  }

  /** Hapus jadwal dari cron engine. */
  unregister(id) {
    const task = this.#tasks.get(id);
    if (task) { task.stop(); this.#tasks.delete(id); }
  }

  /**
   * Trigger manual — jalankan jadwal sekarang tanpa menunggu cron.
   * Return jobId yang di-submit.
   */
  async trigger(id) {
    const s = await this.#store.get(id);
    if (!s) throw new Error(`Jadwal tidak ditemukan: ${id}`);
    const job = await this.#scraper.submit({
      platform:    s.platform,
      targetUrl:   s.target_url,
      profileName: s.profile_name,
      options:     s.options ?? {},
      webhookUrl:  s.webhook_url,
    });
    await this.#store.touchRun(id);
    return { triggered: true, scheduleId: id, jobId: job.id };
  }

  status() {
    return {
      count:     this.#tasks.size,
      activeIds: [...this.#tasks.keys()],
      timezone:  TZ,
    };
  }

  async stop() {
    for (const task of this.#tasks.values()) task.stop();
    this.#tasks.clear();
    console.log('[Scheduler] Semua jadwal dihentikan');
  }
}
