import { Queue, Worker, QueueEvents } from 'bullmq';
import { SCRAPERS } from '../scraper/ScraperService.js';
import { WebhookManager } from '../webhook/WebhookManager.js';
// mqttPublisher diinject dari luar — null jika MQTT tidak dikonfigurasi

const QUEUE_NAME = 'scraper';

const DEFAULT_JOB_OPTS = {
  attempts:  3,
  backoff:   { type: 'exponential', delay: 8_000 },
  removeOnComplete: { count: 200, age: 86_400 },
  removeOnFail:     { count: 500, age: 7 * 86_400 },
};

// Domain root cookies per platform (untuk get/set cookies dari browser context)
const PLATFORM_DOMAIN = {
  instagram: '.instagram.com',
  tiktok:    '.tiktok.com',
  twitter:   '.twitter.com',
};

const webhook = new WebhookManager();

export class JobQueue {
  #queue;
  #worker;
  #events;
  #pool;

  #mqtt; // MqttPublisher | null

  constructor(redisConfig, { pool, manager, dataStore, sessionStore = null, mqttPublisher = null }) {
    this.#pool = pool;
    this.#mqtt = mqttPublisher;

    this.#queue = new Queue(QUEUE_NAME, { connection: redisConfig });

    this.#worker = new Worker(
      QUEUE_NAME,
      async (bullJob) => this.#process(bullJob, manager, dataStore, sessionStore),
      {
        connection:  redisConfig,
        concurrency: pool.size,
      }
    );

    this.#events = new QueueEvents(QUEUE_NAME, { connection: redisConfig });

    this.#worker.on('failed', (bullJob, err) => {
      console.error(`[Queue] job ${bullJob?.data?.jobId} failed: ${err.message}`);
    });
  }

  async #process(bullJob, manager, dataStore, sessionStore) {
    const { jobId, platform, targetUrl, options, webhookUrl } = bullJob.data;
    const isFinal = bullJob.attemptsMade >= (bullJob.opts.attempts ?? 1) - 1;

    let slot;
    try {
      slot = await this.#pool.acquire(jobId, 90_000);
    } catch (err) {
      if (isFinal) {
        await dataStore.updateJob(jobId, { status: 'failed', error: err.message });
        const failPayload = { jobId, platform, status: 'failed', error: err.message, timestamp: Date.now() };
        await Promise.all([
          webhook.fire(webhookUrl, failPayload),
          this.#mqtt?.publish(jobId, failPayload),
        ]);
      }
      throw err;
    }

    await dataStore.updateJob(jobId, { status: 'running' });

    try {
      try {
        await manager.dispatch('start', { profile: slot.profile });
      } catch {
        await this.#pool.restartSlot(slot);
        await manager.dispatch('start', { profile: slot.profile });
      }

      const dispatch = (action, payload = {}) =>
        manager.dispatch(action, { ...payload, profile: slot.profile });

      // ── Restore session cookies dari DB ke browser ──────────────────
      if (sessionStore) {
        const saved = await sessionStore.load(slot.profile, platform);
        if (saved?.length) {
          await dispatch('cookies', { kind: 'set', cookies: saved });
        }
      }

      const scraper = SCRAPERS[platform];
      if (!scraper) throw new Error(`Scraper tidak ditemukan: ${platform}`);

      const { profile, posts } = await scraper.scrape(dispatch, targetUrl, options ?? {});
      await dataStore.saveResults(jobId, platform, { profile, posts });

      // ── Simpan cookies browser ke DB setelah scraping berhasil ──────
      if (sessionStore) {
        try {
          const domain = PLATFORM_DOMAIN[platform];
          const result = await dispatch('cookies', { kind: 'get', domain });
          const cookies = result?.cookies ?? result ?? [];
          if (Array.isArray(cookies) && cookies.length) {
            // Expire session 30 hari dari sekarang
            const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
            await sessionStore.save(slot.profile, platform, cookies, expires);
          }
        } catch (e) {
          console.warn(`[JobQueue] Gagal simpan session ${slot.profile}/${platform}: ${e.message}`);
        }
      }

      const donePayload = {
        jobId, platform, targetUrl, status: 'done',
        postCount: posts.length,
        profile: profile?.username ?? null,
        timestamp: Date.now(),
      };
      await Promise.all([
        webhook.fire(webhookUrl, donePayload),
        this.#mqtt?.publish(jobId, donePayload),
      ]);
    } catch (err) {
      if (isFinal) {
        await dataStore.updateJob(jobId, { status: 'failed', error: err.message });
        const failPayload = { jobId, platform, targetUrl, status: 'failed', error: err.message, timestamp: Date.now() };
        await Promise.all([
          webhook.fire(webhookUrl, failPayload),
          this.#mqtt?.publish(jobId, failPayload),
        ]);
      }
      throw err;
    } finally {
      this.#pool.release(slot);
    }
  }

  /** Tambahkan job ke queue. webhookUrl disimpan di bullJob.data untuk diakses worker. */
  async add({ jobId, platform, targetUrl, options, webhookUrl = null }, opts = {}) {
    const bullJob = await this.#queue.add(
      'scrape',
      { jobId, platform, targetUrl, options, webhookUrl },
      { ...DEFAULT_JOB_OPTS, ...opts }
    );
    return bullJob.id;
  }

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
