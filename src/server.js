import Fastify from 'fastify';
import { z } from 'zod';
import { BrowserManager } from './browser/BrowserManager.js';
import { ScraperService, SUPPORTED_PLATFORMS } from './scraper/ScraperService.js';
import * as analytics from './scraper/analytics.js';
import { createApiKeyHook } from './middleware/apiKey.js';
import { createAuditHooks } from './middleware/auditHook.js';
import { createRateLimitHook } from './middleware/rateLimitHook.js';
import {
  EXPORT_FORMATS, EXPORT_TYPES,
  queryPosts, queryProfiles, queryJobs,
  serialize, contentType as exportContentType, filename as exportFilename,
} from './scraper/Exporter.js';

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

export function createServer(config, { browser: injectedBrowser, dataStore, sessionStore = null, scheduleStore = null, jobQueue = null, pool = null, scheduler = null, metrics = null, alertManager = null, keyStore = null, auditLogger = null, rateLimiter = null, eventBus = null, sseManager = null } = {}) {
  const app = Fastify({ logger: true });
  const browser = injectedBrowser ?? new BrowserManager(config.browser);
  const scraper = dataStore ? new ScraperService(browser, dataStore, jobQueue) : null;

  // ── API key auth ─────────────────────────────────────────────────────────
  // Gunakan KeyStore jika tersedia, fallback ke legacy string key
  const apiKeyHook = keyStore
    ? createApiKeyHook(keyStore)
    : createApiKeyHook(config.server?.apiKey);
  if (apiKeyHook) app.addHook('preHandler', apiKeyHook);

  // ── Audit logging ────────────────────────────────────────────────────────
  const auditHooks = createAuditHooks(auditLogger);
  if (auditHooks) {
    app.addHook('onRequest', auditHooks.onRequest);
    app.addHook('onResponse', auditHooks.onResponse);
  }

  // ── Per-key rate limiting (dipasang setelah auth agar keyName tersedia) ──
  const rateLimitHook = createRateLimitHook(rateLimiter);
  if (rateLimitHook) app.addHook('preHandler', rateLimitHook);

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
    options:     z.record(z.unknown()).optional(),
    webhookUrl:  z.string().url().optional(),
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
      metrics: ['engagement', 'top_posts', 'hashtags', 'frequency', 'profile_history', 'platform_summary'],
      exportFormats: EXPORT_FORMATS,
      exportTypes:   EXPORT_TYPES,
    }));

    // ─── Export API ───────────────────────────────────────────────────────────

    const exportQuerySchema = z.object({
      format:   z.enum(EXPORT_FORMATS).default('json'),
      platform: z.enum(SUPPORTED_PLATFORMS).optional(),
      status:   z.string().optional(),
      limit:    z.coerce.number().int().positive().max(10_000).default(1000),
      offset:   z.coerce.number().int().min(0).default(0),
      since:    z.coerce.number().optional(),  // Unix ms
      until:    z.coerce.number().optional(),
    });

    const QUERY_FN = {
      posts:    (pool, q) => queryPosts(pool,    q),
      profiles: (pool, q) => queryProfiles(pool, q),
      jobs:     (pool, q) => queryJobs(pool,     q),
    };

    /**
     * GET /scraper/export/:type?format=csv&platform=instagram&limit=5000
     *
     * type: posts | profiles | jobs
     * Mengembalikan file yang siap di-download dengan Content-Disposition header.
     */
    app.get('/scraper/export/:type', async (req, reply) => {
      const type = req.params.type;
      if (!EXPORT_TYPES.includes(type)) {
        reply.code(400);
        return { ok: false, error: `Type tidak valid. Pilih: ${EXPORT_TYPES.join(', ')}` };
      }
      try {
        const q    = exportQuerySchema.parse(req.query);
        const pool = dataStore.pool;
        const rows = await QUERY_FN[type](pool, q);
        const body = serialize(rows, q.format, type);
        const ct   = exportContentType(q.format);
        const fn   = exportFilename(type, q.platform, q.format);

        reply
          .code(200)
          .header('Content-Type', ct)
          .header('Content-Disposition', `attachment; filename="${fn}"`)
          .header('X-Export-Count', String(rows.length))
          .send(body);
      } catch (err) {
        reply.code(err.name === 'ZodError' ? 400 : 500);
        return { ok: false, error: err.message };
      }
    });

    /**
     * GET /scraper/jobs/:id/export?format=csv&type=posts
     * Export hasil satu job spesifik.
     */
    app.get('/scraper/jobs/:id/export', async (req, reply) => {
      const { id }   = req.params;
      const type     = String(req.query.type ?? 'posts');
      const format   = String(req.query.format ?? 'json');

      if (!EXPORT_TYPES.includes(type)) {
        reply.code(400);
        return { ok: false, error: `Type tidak valid. Pilih: ${EXPORT_TYPES.join(', ')}` };
      }
      if (!EXPORT_FORMATS.includes(format)) {
        reply.code(400);
        return { ok: false, error: `Format tidak valid. Pilih: ${EXPORT_FORMATS.join(', ')}` };
      }

      try {
        const pool = dataStore.pool;
        const rows = await QUERY_FN[type](pool, { jobId: id, limit: 10_000 });

        if (rows.length === 0) {
          // Pastikan job ada, baru return empty
          const job = await dataStore.getJob(id);
          if (!job) { reply.code(404); return { ok: false, error: 'Job tidak ditemukan' }; }
        }

        const body = serialize(rows, format, type);
        const ct   = exportContentType(format);
        const fn   = exportFilename(type, 'job-' + id.slice(0, 8), format);

        reply
          .code(200)
          .header('Content-Type', ct)
          .header('Content-Disposition', `attachment; filename="${fn}"`)
          .header('X-Export-Count', String(rows.length))
          .send(body);
      } catch (err) {
        reply.code(500);
        return { ok: false, error: err.message };
      }
    });
  }

  // ─────────────────────────────────────────────
  // Session API (tersedia hanya jika sessionStore aktif)
  // ─────────────────────────────────────────────

  if (sessionStore) {
    // List semua session (admin)
    app.get('/sessions', async (_, reply) => {
      try {
        return { ok: true, sessions: await sessionStore.listAll() };
      } catch (err) {
        reply.code(500); return { ok: false, error: err.message };
      }
    });

    // List session per profile
    app.get('/sessions/:profile', async (req, reply) => {
      try {
        return { ok: true, sessions: await sessionStore.list(req.params.profile) };
      } catch (err) {
        reply.code(500); return { ok: false, error: err.message };
      }
    });

    // Hapus session per profile (opsional: ?platform=instagram)
    app.delete('/sessions/:profile', async (req, reply) => {
      try {
        const { platform } = req.query;
        await sessionStore.clear(req.params.profile, platform ?? null);
        return { ok: true, cleared: { profile: req.params.profile, platform: platform ?? 'all' } };
      } catch (err) {
        reply.code(500); return { ok: false, error: err.message };
      }
    });
  }

  // ─────────────────────────────────────────────
  // Schedule API
  // ─────────────────────────────────────────────

  if (scheduleStore) {
    const scheduleSchema = z.object({
      platform:    z.enum(SUPPORTED_PLATFORMS),
      targetUrl:   z.string().url(),
      profileName: z.string().optional(),
      cronExpr:    z.string(),
      options:     z.record(z.unknown()).optional(),
      webhookUrl:  z.string().url().optional(),
    });

    const schedulePatchSchema = z.object({
      platform:    z.enum(SUPPORTED_PLATFORMS).optional(),
      targetUrl:   z.string().url().optional(),
      profileName: z.string().optional(),
      cronExpr:    z.string().optional(),
      options:     z.record(z.unknown()).optional(),
      webhookUrl:  z.string().url().optional(),
      enabled:     z.boolean().optional(),
    });

    // Buat jadwal baru
    app.post('/schedules', async (req, reply) => {
      try {
        const payload = scheduleSchema.parse(req.body || {});
        // Validasi cron expression via node-cron
        const { default: cron } = await import('node-cron');
        if (!cron.validate(payload.cronExpr)) {
          reply.code(400);
          return { ok: false, error: `Cron expression tidak valid: "${payload.cronExpr}"` };
        }
        const schedule = await scheduleStore.create(payload);
        if (scheduler) await scheduler.reload(schedule.id);
        reply.code(201);
        return { ok: true, schedule };
      } catch (err) {
        reply.code(err.name === 'ZodError' ? 400 : 500);
        return { ok: false, error: err.message };
      }
    });

    // List semua jadwal
    app.get('/schedules', async (req, reply) => {
      try {
        const { enabled } = req.query;
        const schedules = await scheduleStore.listAll(
          enabled != null ? { enabled: enabled === 'true' } : {}
        );
        return { ok: true, schedules };
      } catch (err) {
        reply.code(500); return { ok: false, error: err.message };
      }
    });

    // Get jadwal
    app.get('/schedules/:id', async (req, reply) => {
      try {
        const s = await scheduleStore.get(req.params.id);
        if (!s) { reply.code(404); return { ok: false, error: 'Jadwal tidak ditemukan' }; }
        return { ok: true, schedule: s };
      } catch (err) {
        reply.code(500); return { ok: false, error: err.message };
      }
    });

    // Update jadwal
    app.patch('/schedules/:id', async (req, reply) => {
      try {
        const payload = schedulePatchSchema.parse(req.body || {});
        if (payload.cronExpr) {
          const { default: cron } = await import('node-cron');
          if (!cron.validate(payload.cronExpr)) {
            reply.code(400);
            return { ok: false, error: `Cron expression tidak valid: "${payload.cronExpr}"` };
          }
        }
        const schedule = await scheduleStore.update(req.params.id, payload);
        if (!schedule) { reply.code(404); return { ok: false, error: 'Jadwal tidak ditemukan' }; }
        if (scheduler) await scheduler.reload(schedule.id);
        return { ok: true, schedule };
      } catch (err) {
        reply.code(err.name === 'ZodError' ? 400 : 500);
        return { ok: false, error: err.message };
      }
    });

    // Hapus jadwal
    app.delete('/schedules/:id', async (req, reply) => {
      try {
        await scheduleStore.delete(req.params.id);
        if (scheduler) scheduler.unregister(req.params.id);
        return { ok: true, deleted: req.params.id };
      } catch (err) {
        reply.code(500); return { ok: false, error: err.message };
      }
    });

    // Trigger manual
    app.post('/schedules/:id/trigger', async (req, reply) => {
      try {
        if (!scheduler) {
          reply.code(503);
          return { ok: false, error: 'Scheduler tidak aktif (Redis/DB diperlukan)' };
        }
        const result = await scheduler.trigger(req.params.id);
        return { ok: true, ...result };
      } catch (err) {
        reply.code(err.message.includes('tidak ditemukan') ? 404 : 500);
        return { ok: false, error: err.message };
      }
    });
  }

  // ─────────────────────────────────────────────
  // Metrics API (Prometheus + JSON)
  // ─────────────────────────────────────────────

  // Prometheus scrape endpoint — selalu publik (tidak perlu Bearer token)
  app.get('/metrics', async (_, reply) => {
    reply.type('text/plain; version=0.0.4; charset=utf-8');
    let text = metrics ? metrics.toPrometheusText() : '';

    // Pool gauge — dibaca live karena berubah terus
    if (pool) {
      const s = pool.status();
      text += '# HELP browser_pool_slots_active Number of busy browser pool slots\n';
      text += '# TYPE browser_pool_slots_active gauge\n';
      text += 'browser_pool_slots_active ' + s.busy + '\n';
      text += '# HELP browser_pool_slots_total Total browser pool capacity\n';
      text += '# TYPE browser_pool_slots_total gauge\n';
      text += 'browser_pool_slots_total ' + s.size + '\n';
    }

    return text || '# no metrics collected yet\n';
  });

  // JSON snapshot untuk admin dashboard
  app.get('/monitor/metrics', async () => ({
    ok:       true,
    metrics:  metrics      ? metrics.snapshot()      : null,
    alerts:   alertManager ? alertManager.status()   : null,
    pool:     pool         ? pool.status()            : null,
  }));

  // ─────────────────────────────────────────────
  // Monitor API (tersedia hanya jika pool / queue dikonfigurasi)
  // ─────────────────────────────────────────────

  app.get('/monitor/health', async () => ({
    ok:        true,
    pool:      pool         ? pool.status()                            : null,
    queue:     jobQueue     ? await jobQueue.stats().catch(() => null) : null,
    scheduler: scheduler    ? scheduler.status()                       : null,
    alerts:    alertManager ? alertManager.status()                    : null,
    db:        dataStore    ? 'connected'                              : 'disabled',
    sse:       sseManager   ? sseManager.status()                      : null,
  }));

  if (pool) {
    app.get('/monitor/pool', async () => pool.status());
  }

  if (jobQueue) {
    app.get('/monitor/queue', async (_, reply) => {
      try {
        return await jobQueue.stats();
      } catch (err) {
        reply.code(500);
        return { error: err.message };
      }
    });
  }

  // ─────────────────────────────────────────────
  // Audit Log API
  // ─────────────────────────────────────────────

  if (auditLogger) {
    const auditQuerySchema = z.object({
      keyName: z.string().optional(),
      status:  z.enum(['ok', 'error']).optional(),
      limit:   z.coerce.number().int().positive().max(1000).optional(),
      offset:  z.coerce.number().int().min(0).optional(),
      since:   z.coerce.number().optional(),
      until:   z.coerce.number().optional(),
    });

    app.get('/admin/audit', async (req, reply) => {
      try {
        const q = auditQuerySchema.parse(req.query);
        return { ok: true, ...auditLogger.query(q) };
      } catch (err) {
        reply.code(400); return { ok: false, error: err.message };
      }
    });

    app.get('/admin/audit/stats', async () => ({
      ok: true,
      stats: auditLogger.stats(),
      total: auditLogger.size(),
    }));
  }

  // ─────────────────────────────────────────────
  // Key Registry API
  // ─────────────────────────────────────────────

  if (keyStore && !keyStore.isEmpty()) {
    app.get('/admin/keys', async () => ({
      ok:    true,
      keys:  keyStore.names(),
      usage: rateLimiter ? rateLimiter.status() : null,
    }));
  }

  // ─────────────────────────────────────────────
  // SSE — Real-time Event Stream
  // ─────────────────────────────────────────────

  if (eventBus && sseManager) {
    const VALID_TOPICS = new Set([
      'job.queued', 'job.started', 'job.completed', 'job.failed', 'job.retry',
      'alert.fired', 'audit.error', '*',
    ]);

    /**
     * GET /events?topics=job.completed,alert.fired
     *
     * Kosong atau '*' = subscribe ke semua topic.
     * Content-Type: text/event-stream
     */
    app.get('/events', async (req, reply) => {
      const rawTopics = String(req.query.topics ?? '').trim();
      const topics = rawTopics
        ? rawTopics.split(',').map((t) => t.trim()).filter((t) => VALID_TOPICS.has(t))
        : ['*'];

      reply.raw.writeHead(200, {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
        'X-Accel-Buffering': 'no', // disable nginx buffering
      });

      // Kirim komentar awal agar client tahu koneksi berhasil
      reply.raw.write(': connected topics=' + topics.join(',') + '\n\n');

      sseManager.add(reply, eventBus, topics);

      // Fastify tidak boleh menutup response sendiri — biarkan SSE tetap terbuka
      await new Promise((resolve) => reply.raw.on('close', resolve));
    });

    /**
     * GET /scraper/jobs/:id/stream — SSE stream spesifik untuk satu job.
     * Otomatis tutup setelah menerima event job.completed atau job.failed untuk job ini.
     */
    app.get('/scraper/jobs/:id/stream', async (req, reply) => {
      const { id } = req.params;

      reply.raw.writeHead(200, {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      reply.raw.write(': watching job ' + id + '\n\n');

      let unsubClose;
      const done = new Promise((resolve) => {
        const handler = (topic, data) => {
          if (data.jobId !== id) return;
          try {
            reply.raw.write('event: ' + topic + '\n');
            reply.raw.write('data: ' + JSON.stringify(data) + '\n\n');
          } catch { /* ignore */ }
          if (topic === 'job.completed' || topic === 'job.failed') {
            reply.raw.write('event: stream.end\ndata: {}\n\n');
            resolve();
          }
        };
        unsubClose = eventBus.subscribeMany(
          ['job.started', 'job.completed', 'job.failed', 'job.retry'],
          handler
        );
        reply.raw.on('close', resolve);
      });

      await done;
      if (unsubClose) unsubClose();
      try { reply.raw.end(); } catch { /* ignore */ }
    });

    // Status koneksi SSE untuk /monitor/health
    app.get('/events/status', async () => ({
      ok:          true,
      connections: sseManager.count(),
      topics:      eventBus.knownTopics(),
    }));
  }

  // ─────────────────────────────────────────────
  // Admin Dashboard HTML
  // ─────────────────────────────────────────────

  app.get('/admin', async (_, reply) => {
    reply.type('text/html');
    return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Browser Scraper — Monitor</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:ui-monospace,monospace;background:#0d1117;color:#c9d1d9;padding:20px}
    h1{color:#58a6ff;font-size:16px;margin-bottom:16px}
    .card{background:#161b22;border:1px solid #30363d;border-radius:6px;padding:16px;margin:12px 0}
    .card h2{color:#79c0ff;font-size:13px;margin-bottom:12px;display:flex;justify-content:space-between}
    .card h2 span{color:#8b949e;font-size:11px;font-weight:normal}
    .metrics{display:flex;flex-wrap:wrap;gap:16px}
    .metric .label{color:#8b949e;font-size:11px}
    .metric .value{font-size:28px;font-weight:bold;line-height:1.2}
    .busy{color:#f85149}.free{color:#3fb950}.warn{color:#e3b341}
    .slots{margin-top:10px;display:flex;flex-wrap:wrap;gap:4px}
    .slot{padding:4px 10px;border-radius:4px;font-size:12px;line-height:1.6}
    .slot.busy{background:#3d1f1e;border:1px solid #f85149;color:#f85149}
    .slot.free{background:#1a2e1a;border:1px solid #3fb950;color:#3fb950}
    .slot small{display:block;font-size:10px;opacity:.7}
    .err{color:#f85149;font-size:12px;margin-top:8px}
    .alert-ok{color:#3fb950}.alert-firing{color:#f85149}
    .sublabel{color:#8b949e;font-size:11px;margin:8px 0 4px}
  </style>
</head>
<body>
  <h1>Browser Scraper — Monitor</h1>

  <div class="card">
    <h2>Browser Pool <span id="ts-pool"></span></h2>
    <div class="metrics" id="pool-metrics"></div>
    <div class="slots"   id="pool-slots"></div>
    <div class="err"     id="pool-err"></div>
  </div>

  <div class="card">
    <h2>Job Queue (BullMQ) <span id="ts-queue"></span></h2>
    <div class="metrics" id="queue-metrics"></div>
    <div class="err"     id="queue-err"></div>
  </div>

  <div class="card">
    <h2>Sessions</h2>
    <div id="session-list" style="font-size:12px;line-height:1.8"></div>
    <div class="err" id="session-err"></div>
  </div>

  <div class="card">
    <h2>Schedules <span id="ts-sched"></span></h2>
    <div class="metrics" id="sched-metrics"></div>
    <div id="sched-list" style="margin-top:10px;font-size:12px;line-height:1.8"></div>
    <div class="err" id="sched-err"></div>
  </div>

  <div class="card">
    <h2>Metrics <span id="ts-metrics"></span></h2>
    <div class="metrics" id="metrics-breakdown"></div>
    <div class="sublabel">Platform Alerts</div>
    <div id="alerts-breakdown" style="font-size:12px;line-height:1.8"></div>
    <div class="err" id="metrics-err"></div>
  </div>

  <div class="card">
    <h2>SSE Connections <span id="ts-sse"></span></h2>
    <div class="metrics" id="sse-metrics"></div>
    <div id="sse-topics" style="font-size:12px;line-height:1.8;margin-top:8px"></div>
    <div class="err" id="sse-err"></div>
  </div>

  <div class="card">
    <h2>API Keys &amp; Rate Limits <span id="ts-keys"></span></h2>
    <div id="keys-list" style="font-size:12px;line-height:1.8"></div>
    <div class="err" id="keys-err"></div>
  </div>

  <div class="card">
    <h2>Audit Log <span id="ts-audit"></span></h2>
    <div class="metrics" id="audit-stats"></div>
    <div class="sublabel">Recent requests</div>
    <div id="audit-list" style="font-size:11px;line-height:1.8;font-family:monospace"></div>
    <div class="err" id="audit-err"></div>
  </div>

  <script>
    const now = () => new Date().toLocaleTimeString();
    function metric(label, value, cls='') {
      return '<div class="metric"><div class="label">'+label+'</div><div class="value '+cls+'">'+value+'</div></div>';
    }

    async function refreshPool() {
      try {
        const p = await fetch('/monitor/pool').then(r => r.json());
        document.getElementById('ts-pool').textContent = now();
        document.getElementById('pool-err').textContent = '';
        document.getElementById('pool-metrics').innerHTML =
          metric('Size',   p.size)  +
          metric('Busy',   p.busy,           'busy') +
          metric('Free',   p.size - p.busy,  'free');
        document.getElementById('pool-slots').innerHTML = p.slots.map(s =>
          '<div class="slot '+(s.busy?'busy':'free')+'">'+s.profile+
          (s.jobId ? '<small>'+s.jobId.slice(0,8)+'…</small>' : '')+
          '</div>'
        ).join('');
      } catch(e) {
        document.getElementById('pool-err').textContent = 'Pool tidak tersedia';
      }
    }

    async function refreshQueue() {
      try {
        const q = await fetch('/monitor/queue').then(r => r.json());
        document.getElementById('ts-queue').textContent = now();
        document.getElementById('queue-err').textContent = '';
        document.getElementById('queue-metrics').innerHTML =
          metric('Waiting',   q.waiting,   q.waiting   > 10 ? 'warn' : '') +
          metric('Active',    q.active,    'free')  +
          metric('Completed', q.completed, '')       +
          metric('Failed',    q.failed,    q.failed > 0 ? 'busy' : '') +
          metric('Delayed',   q.delayed,   '');
      } catch(e) {
        document.getElementById('queue-err').textContent = 'Queue tidak tersedia';
      }
    }

    async function refreshSessions() {
      try {
        const s = await fetch('/sessions').then(r => r.json());
        document.getElementById('session-err').textContent = '';
        if (!s.sessions?.length) {
          document.getElementById('session-list').textContent = 'Belum ada session tersimpan.';
          return;
        }
        document.getElementById('session-list').innerHTML = s.sessions.map(r =>
          '<div><span style="color:#79c0ff">'+r.profile+'</span> / <span style="color:#e3b341">'+r.platform+'</span> — '+r.cookie_count+' cookies — updated '+new Date(r.updated_at).toLocaleString()+(r.expires_at ? ' — exp '+new Date(r.expires_at).toLocaleDateString() : '')+'</div>'
        ).join('');
      } catch {
        document.getElementById('session-err').textContent = 'Sessions tidak tersedia';
      }
    }

    async function refreshSchedules() {
      try {
        const h = await fetch('/monitor/health').then(r => r.json());
        const s = h.scheduler;
        if (!s) { document.getElementById('sched-err').textContent = 'Scheduler tidak aktif'; return; }
        document.getElementById('ts-sched').textContent = now();
        document.getElementById('sched-metrics').innerHTML =
          metric('Aktif', s.count, s.count > 0 ? 'free' : '');
        const list = await fetch('/schedules').then(r => r.json());
        document.getElementById('sched-list').innerHTML = (list.schedules||[]).map(s =>
          '<div><span style="color:#79c0ff">'+s.platform+'</span> | <span style="color:#e3b341">'+s.cron_expr+'</span> | '+
          s.target_url.slice(0,50)+(s.target_url.length>50?'…':'')+
          ' | '+(s.enabled ? '<span style="color:#3fb950">on</span>' : '<span style="color:#8b949e">off</span>')+
          (s.last_run_at ? ' | last: '+new Date(s.last_run_at).toLocaleString() : '')+
          '</div>'
        ).join('') || '<div style="color:#8b949e">Belum ada jadwal</div>';
        document.getElementById('sched-err').textContent = '';
      } catch { document.getElementById('sched-err').textContent = 'Gagal load schedules'; }
    }

    async function refreshMetrics() {
      try {
        const m = await fetch('/monitor/metrics').then(r => r.json());
        document.getElementById('ts-metrics').textContent = now();
        document.getElementById('metrics-err').textContent = '';

        const c = m.metrics ? m.metrics.counters : {};
        let completed = 0, failed = 0, retries = 0;
        for (const key of Object.keys(c)) {
          if (key.indexOf('status="completed"') !== -1) completed += c[key];
          if (key.indexOf('status="failed"')    !== -1) failed    += c[key];
          if (key.indexOf('scraper_retries_total') !== -1) retries += c[key];
        }
        const sums = m.metrics ? m.metrics.summaries : {};
        let durSum = 0, durCount = 0;
        for (const v of Object.values(sums)) { durSum += v.sum; durCount += v.count; }
        const avgDur = durCount > 0 ? (durSum / durCount).toFixed(1) + 's' : '—';

        document.getElementById('metrics-breakdown').innerHTML =
          metric('Completed', completed, 'free') +
          metric('Failed',    failed,    failed  > 0 ? 'busy' : '') +
          metric('Retries',   retries,   retries > 0 ? 'warn' : '') +
          metric('Avg Dur',   avgDur,    '');

        const alerts = m.alerts || {};
        const entries = Object.keys(alerts);
        if (entries.length === 0) {
          document.getElementById('alerts-breakdown').innerHTML = '<div style="color:#8b949e">Tidak ada alert</div>';
        } else {
          document.getElementById('alerts-breakdown').innerHTML = entries.map(function(platform) {
            const info = alerts[platform];
            const cls  = info.alerting ? 'alert-firing' : 'alert-ok';
            return '<div><span style="color:#79c0ff">' + platform + '</span> — consecutive fails: <span class="' + cls + '">' + info.consecutiveFailures + '</span>/' + info.alertThreshold + '</div>';
          }).join('');
        }
      } catch(e) {
        document.getElementById('metrics-err').textContent = 'Metrics tidak tersedia';
      }
    }

    async function refreshSse() {
      try {
        const s = await fetch('/events/status').then(r => r.json());
        document.getElementById('ts-sse').textContent = now();
        document.getElementById('sse-err').textContent = '';
        document.getElementById('sse-metrics').innerHTML = metric('Clients', s.connections, s.connections > 0 ? 'free' : '');
        document.getElementById('sse-topics').innerHTML = s.topics.length
          ? 'Topics aktif: <span style="color:#e3b341">' + s.topics.join(', ') + '</span>'
          : '<span style="color:#8b949e">Belum ada event diterbitkan</span>';
      } catch { document.getElementById('sse-err').textContent = 'SSE tidak aktif'; }
    }

    async function refreshKeys() {
      try {
        const k = await fetch('/admin/keys').then(r => r.json());
        document.getElementById('ts-keys').textContent = now();
        document.getElementById('keys-err').textContent = '';
        const usage = k.usage || {};
        document.getElementById('keys-list').innerHTML = (k.keys || []).map(function(name) {
          const u = usage[name];
          return '<div><span style="color:#79c0ff">' + name + '</span>' +
            (u ? ' — ' + u.minuteUsed + '/' + u.rpmLimit + ' rpm | ' + u.hourUsed + '/' + u.rphLimit + ' rph' : '') +
            '</div>';
        }).join('') || '<div style="color:#8b949e">Auth tidak aktif (open mode)</div>';
      } catch { document.getElementById('keys-list').innerHTML = '<div style="color:#8b949e">Auth tidak aktif (open mode)</div>'; }
    }

    async function refreshAudit() {
      try {
        const [stats, log] = await Promise.all([
          fetch('/admin/audit/stats').then(r => r.json()),
          fetch('/admin/audit?limit=20').then(r => r.json()),
        ]);
        document.getElementById('ts-audit').textContent = now();
        document.getElementById('audit-err').textContent = '';

        const s = stats.stats || {};
        document.getElementById('audit-stats').innerHTML = Object.keys(s).map(function(k) {
          return metric(k, s[k].total) + metric('OK', s[k].success, 'free') + metric('Err', s[k].error, s[k].error > 0 ? 'busy' : '') + metric('Avg', s[k].avgDurationMs + 'ms', '');
        }).join('') || metric('Total', stats.total || 0);

        document.getElementById('audit-list').innerHTML = (log.items || []).map(function(e) {
          const ts  = new Date(e.ts).toLocaleTimeString();
          const cls = e.status >= 400 ? 'color:#f85149' : 'color:#3fb950';
          return '<div><span style="color:#8b949e">' + ts + '</span> <span style="' + cls + '">' + e.status + '</span> <span style="color:#e3b341">' + e.method + '</span> <span style="color:#c9d1d9">' + e.path + '</span> <span style="color:#8b949e">' + e.durationMs + 'ms</span>' +
            (e.keyName && e.keyName !== 'anonymous' ? ' <span style="color:#79c0ff">[' + e.keyName + ']</span>' : '') + '</div>';
        }).join('') || '<div style="color:#8b949e">Belum ada request tercatat</div>';
      } catch { document.getElementById('audit-err').textContent = 'Audit log tidak tersedia'; }
    }

    function refresh() { refreshPool(); refreshQueue(); refreshSessions(); refreshSchedules(); refreshMetrics(); refreshSse(); refreshKeys(); refreshAudit(); }
    refresh();
    setInterval(refresh, 3000);
  </script>
</body>
</html>`;
  });

  return app;
}
