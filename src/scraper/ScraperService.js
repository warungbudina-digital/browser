import crypto from 'node:crypto';
import { InstagramScraper } from './platforms/instagram.js';
import { TikTokScraper }    from './platforms/tiktok.js';
import { TwitterScraper }   from './platforms/twitter.js';

const SCRAPERS = {
  instagram: new InstagramScraper(),
  tiktok:    new TikTokScraper(),
  twitter:   new TwitterScraper(),
};

export const SUPPORTED_PLATFORMS = Object.keys(SCRAPERS);

export class ScraperService {
  #manager;
  #store;

  constructor(browserManager, dataStore) {
    this.#manager = browserManager;
    this.#store   = dataStore;
  }

  /**
   * Submit job scraping — langsung return jobId, eksekusi async di background.
   */
  async submit({ platform, targetUrl, profileName = 'openclaw', options = {} }) {
    if (!SCRAPERS[platform]) {
      throw new Error(`Platform tidak didukung: ${platform}. Pilih: ${SUPPORTED_PLATFORMS.join(', ')}`);
    }
    if (!targetUrl) throw new Error('targetUrl wajib diisi');

    const id = crypto.randomUUID();
    await this.#store.saveJob({ id, platform, targetUrl, profileName, status: 'pending' });

    // Jalankan async — jangan await di sini
    this.#run(id, platform, targetUrl, profileName, options).catch(() => {});

    return { id, platform, targetUrl, profileName, status: 'pending' };
  }

  async getJob(id) {
    return this.#store.getJob(id);
  }

  async listJobs(filters) {
    return this.#store.listJobs(filters);
  }

  async getResults(id) {
    const job = await this.#store.getJob(id);
    if (!job) return null;
    const results = await this.#store.getResults(id);
    return { job, ...results };
  }

  async deleteJob(id) {
    await this.#store.deleteJob(id);
    return { ok: true, deleted: id };
  }

  // ─────────────────────────────────────────────
  // Internal
  // ─────────────────────────────────────────────

  async #run(id, platform, targetUrl, profileName, options) {
    await this.#store.updateJob(id, { status: 'running' });
    try {
      await this.#manager.dispatch('start', { profile: profileName });

      const dispatch = (action, payload = {}) =>
        this.#manager.dispatch(action, { ...payload, profile: profileName });

      const scraper = SCRAPERS[platform];
      const { profile, posts } = await scraper.scrape(dispatch, targetUrl, options);

      await this.#store.saveResults(id, platform, { profile, posts });
    } catch (err) {
      await this.#store.updateJob(id, { status: 'failed', error: err.message });
    }
  }
}
