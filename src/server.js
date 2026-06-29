import Fastify from 'fastify';
import { z } from 'zod';
import { BrowserManager } from './browser/BrowserManager.js';
import { ScraperService, SUPPORTED_PLATFORMS } from './scraper/ScraperService.js';
import * as analytics from './scraper/analytics.js';

const actRequestSchema = z.lazy(() => z.object({
  kind: z.string(),
  ref: z.string().optional(),
  selector: z.string().optional(),
  text: z.string().optional(),
  key: z.string().optional(),
  submit: z.boolean().optional(),
  slowly: z.boolean().optional(),
  doubleClick: z.boolean().optional(),
  button: z.enum(['left', 'right', 'middle']).optional(),
  modifiers: z.array(z.string()).optional(),
  delayMs: z.number().optional(),
  timeoutMs: z.number().optional(),
  startRef: z.string().optional(),
  startSelector: z.string().optional(),
  endRef: z.string().optional(),
  endSelector: z.string().optional(),
  values: z.array(z.string()).optional(),
  fields: z.array(z.object({ ref: z.string().optional(), selector: z.string().optional(), value: z.string().optional() })).optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  timeMs: z.number().optional(),
  textGone: z.string().optional(),
  url: z.string().optional(),
  loadState: z.enum(['load', 'domcontentloaded', 'networkidle']).optional(),
  fn: z.string().optional(),
  targetId: z.string().optional(),
  stopOnError: z.boolean().optional(),
  actions: z.array(actRequestSchema).optional()
}));

const requestSchema = z.object({
  action: z.string(),
  profile: z.string().optional(),
  targetId: z.string().optional(),
  url: z.string().optional(),
  interactive: z.boolean().optional(),
  selector: z.string().optional(),
  limit: z.number().optional(),
  ref: z.string().optional(),
  fullPage: z.boolean().optional(),
  path: z.string().optional(),
  paths: z.array(z.string()).optional(),
  suggestedFilename: z.string().optional(),
  timeoutMs: z.number().optional(),
  level: z.string().optional(),
  clear: z.boolean().optional(),
  filter: z.string().optional(),
  accept: z.boolean().optional(),
  promptText: z.string().optional(),
  screenshots: z.boolean().optional(),
  snapshots: z.boolean().optional(),
  sources: z.boolean().optional(),
  title: z.string().optional(),
  traceAction: z.enum(["start", "stop"]).optional(),
  kind: z.string().optional(),
  cookies: z.array(z.object({
    name: z.string(),
    value: z.string(),
    domain: z.string().optional(),
    path: z.string().optional(),
    expires: z.number().optional(),
    httpOnly: z.boolean().optional(),
    secure: z.boolean().optional(),
    sameSite: z.enum(['Strict', 'Lax', 'None']).optional(),
    url: z.string().optional()
  })).optional(),
  domain: z.string().optional(),
  request: actRequestSchema.optional()
});

const profileSchema = z.object({
  action: z.enum(['list', 'get', 'create', 'update', 'remove', 'select']),
  name: z.string().optional(),
  profile: z.object({
    name: z.string().optional(),
    driver: z.enum(['managed', 'remote-cdp']).optional(),
    headless: z.boolean().optional(),
    executablePath: z.string().optional(),
    channel: z.string().optional(),
    profileDir: z.string().optional(),
    cdpUrl: z.string().optional(),
    color: z.string().optional(),
    stealth: z.boolean().optional(),
    userAgent: z.string().optional(),
    proxy: z.object({
      server: z.string(),
      username: z.string().optional(),
      password: z.string().optional()
    }).optional()
  }).optional()
});

export function createServer(config, { dataStore } = {}) {
  const app = Fastify({ logger: true });
  const browser = new BrowserManager(config.browser);
  const scraper = dataStore ? new ScraperService(browser, dataStore) : null;

  app.get('/health', async () => ({ ok: true }));
  app.get('/browser/capabilities', async () => browser.capabilities());
  app.get('/browser/profiles', async () => browser.listProfiles());

  app.post('/browser/profiles', async (req, reply) => {
    try {
      const payload = profileSchema.parse(req.body || {});
      switch (payload.action) {
        case 'list': return browser.listProfiles();
        case 'get': return browser.getProfile(payload.name);
        case 'create': return browser.createProfile(payload.profile || {});
        case 'update': return browser.updateProfile(payload.name, payload.profile || {});
        case 'remove': return browser.removeProfile(payload.name);
        case 'select': return browser.selectProfile(payload.name);
        default:
          reply.code(400);
          return { ok: false, error: `Unsupported profile action: ${payload.action}` };
      }
    } catch (error) {
      reply.code(500);
      return { ok: false, error: error.message };
    }
  });

  app.post('/browser/request', async (req, reply) => {
    try {
      const payload = requestSchema.parse(req.body || {});
      return await browser.dispatch(payload.action, payload);
    } catch (error) {
      reply.code(500);
      return { ok: false, error: error.message };
    }
  });

  // ─────────────────────────────────────────────
  // Scraper API (tersedia hanya jika dataStore dikonfigurasi)
  // ─────────────────────────────────────────────

  const scraperJobSchema = z.object({
    platform:    z.enum(SUPPORTED_PLATFORMS),
    targetUrl:   z.string().url(),
    profileName: z.string().optional(),
    options:     z.record(z.unknown()).optional()
  });

  const analyticsSchema = z.object({
    metric:   z.enum(['engagement', 'top_posts', 'hashtags', 'frequency', 'profile_history', 'platform_summary']),
    platform: z.enum(SUPPORTED_PLATFORMS).optional(),
    username: z.string().optional(),
    limit:    z.number().int().positive().optional(),
    days:     z.number().int().positive().optional()
  });

  if (scraper) {
    // Submit scraping job
    app.post('/scraper/jobs', async (req, reply) => {
      try {
        const payload = scraperJobSchema.parse(req.body || {});
        const job = await scraper.submit(payload);
        reply.code(202);
        return { ok: true, job };
      } catch (err) {
        reply.code(err.name === 'ZodError' ? 400 : 500);
        return { ok: false, error: err.message };
      }
    });

    // List jobs
    app.get('/scraper/jobs', async (req, reply) => {
      try {
        const { platform, status, limit, offset } = req.query;
        const jobs = await scraper.listJobs({
          platform, status,
          limit:  limit  ? Number(limit)  : 50,
          offset: offset ? Number(offset) : 0
        });
        return { ok: true, jobs };
      } catch (err) {
        reply.code(500);
        return { ok: false, error: err.message };
      }
    });

    // Get job + results
    app.get('/scraper/jobs/:id', async (req, reply) => {
      try {
        const data = await scraper.getResults(req.params.id);
        if (!data) { reply.code(404); return { ok: false, error: 'Job tidak ditemukan' }; }
        return { ok: true, ...data };
      } catch (err) {
        reply.code(500);
        return { ok: false, error: err.message };
      }
    });

    // Delete job
    app.delete('/scraper/jobs/:id', async (req, reply) => {
      try {
        return await scraper.deleteJob(req.params.id);
      } catch (err) {
        reply.code(500);
        return { ok: false, error: err.message };
      }
    });

    // Analytics
    app.get('/scraper/analytics', async (req, reply) => {
      try {
        const q = analyticsSchema.parse(req.query);
        const pool = dataStore.pool;
        switch (q.metric) {
          case 'engagement':
            return { ok: true, data: await analytics.engagementStats(pool, q) };
          case 'top_posts':
            return { ok: true, data: await analytics.topPosts(pool, q) };
          case 'hashtags':
            return { ok: true, data: await analytics.hashtagStats(pool, q) };
          case 'frequency':
            return { ok: true, data: await analytics.postingFrequency(pool, q) };
          case 'profile_history':
            return { ok: true, data: await analytics.profileHistory(pool, q) };
          case 'platform_summary':
            return { ok: true, data: await analytics.platformSummary(pool, q) };
          default:
            reply.code(400);
            return { ok: false, error: 'Unknown metric' };
        }
      } catch (err) {
        reply.code(err.name === 'ZodError' ? 400 : 500);
        return { ok: false, error: err.message };
      }
    });

    // Info platform yang didukung
    app.get('/scraper/capabilities', async () => ({
      ok: true,
      platforms: SUPPORTED_PLATFORMS,
      metrics: ['engagement', 'top_posts', 'hashtags', 'frequency', 'profile_history', 'platform_summary']
    }));
  }

  return app;
}
