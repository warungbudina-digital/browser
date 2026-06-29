import { Queue, Worker, QueueEvents } from 'bullmq';
import { SCRAPERS } from '../scraper/ScraperService.js';

const QUEUE_NAME = 'scraper';

const DEFAULT_JOB_OPTS = {
  attempts:  3,
  backoff:   { type: 'exponential', delay: 8_000 },
  removeOnComplete: { count: 200, age: 86_400 },    // simpan 200 job done, max 1 hari
  removeOnFail:     { count: 500, age: 7 * 86_400 }, // simpan 500 fail, max 7 hari
};

export class JobQueue {
  #queue;
  #worker;
  #events;
  #pool;

  constructor(redisConfig, { pool, manager, dataStore }) {
    this.#pool = pool;

    this.#queue = new Queue(QUEUE_NAME, { connection: redisConfig });

    this.#worker = new Worker(
      QUEUE_NAME,
      async (bullJob) => this.#process(bullJob, manager, dataStore),
      {
        connection:  redisConfig,
        concurrency: pool.size,   // worker parallel = jumlah slot pool
      }
    );

    this.#events = new QueueEvents(QUEUE_NAME, { connection: redisConfig });

    this.#worker.on('failed', (bullJob, err) => {
      console.error(`[Queue] job ${bullJob?.data?.jobId} failed: ${err.message}`);
    });
  }

  async #process(bullJob, manager, dataStore) {
    const { jobId, platform, targetUrl, options } = bullJob.data;
    const isFinal = bullJob.attemptsMade >= (bullJob.opts.attempts ?? 1) - 1;

    // Acquire pool slot — timeout 90s (lebih dari satu halaman platform rata-rata)
    let slot;
    try {
      slot = await this.#pool.acquire(jobId, 90_000);
    } catch (err) {
      if (isFinal) await dataStore.updateJob(jobId, { status: 'failed', error: err.message });
      throw err;
    }

    await dataStore.updateJob(jobId, { status: 'running' });

    try {
      // Pastikan browser di slot ini berjalan (restart jika crash)
      try {
        await manager.dispatch('start', { profile: slot.profile });
      } catch {
        await this.#pool.restartSlot(slot);
        await manager.dispatch('start', { profile: slot.profile });
      }

      const dispatch = (action, payload = {}) =>
        manager.dispatch(action, { ...payload, profile: slot.profile });

      const scraper = SCRAPERS[platform];
      if (!scraper) throw new Error(`Scraper tidak ditemukan untuk platform: ${platform}`);

      const { profile, posts } = await scraper.scrape(dispatch, targetUrl, options ?? {});
      await dataStore.saveResults(jobId, platform, { profile, posts });
      // saveResults() sudah set status='done' di dalam transaksi
    } catch (err) {
      if (isFinal) await dataStore.updateJob(jobId, { status: 'failed', error: err.message });
      throw err; // rethrow agar BullMQ bisa retry
    } finally {
      this.#pool.release(slot);
    }
  }

  /** Tambahkan job ke queue, return BullMQ job ID. */
  async add({ jobId, platform, targetUrl, options }, opts = {}) {
    const bullJob = await this.#queue.add(
      'scrape',
      { jobId, platform, targetUrl, options },
      { ...DEFAULT_JOB_OPTS, ...opts }
    );
    return bullJob.id;
  }

  /** Statistik queue dari Redis. */
  async stats() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.#queue.getWaitingCount(),
      this.#queue.getActiveCount(),
      this.#queue.getCompletedCount(),
      this.#queue.getFailedCount(),
      this.#queue.getDelayedCount(),
    ]);
    return { waiting, active, completed, failed, delayed };
  }

  async close() {
    await this.#worker.close();
    await this.#queue.close();
    await this.#events.close();
  }

  get queue() { return this.#queue; }
}
