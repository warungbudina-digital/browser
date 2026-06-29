import Fastify from 'fastify';
import { z } from 'zod';
import { BrowserManager } from './browser/BrowserManager.js';
import { ScraperService, SUPPORTED_PLATFORMS } from './scraper/ScraperService.js';
import * as analytics from './scraper/analytics.js';
import { createApiKeyHook } from './middleware/apiKey.js';

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

export function createServer(config, { browser: injectedBrowser, dataStore, sessionStore = null, scheduleStore = null, jobQueue = null, pool = null, scheduler = null } = {}) {
  const app = Fastify({ logger: true });
  const browser = injectedBrowser ?? new BrowserManager(config.browser);
  const scraper = dataStore ? new ScraperService(browser, dataStore, jobQueue) : null;

  // ── API key auth (global, /health dikecualikan) ──────────────────────────
  const apiKeyHook = createApiKeyHook(config.server?.apiKey);
  if (apiKeyHook) app.addHook('preHandler', apiKeyHook);

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
      metrics: ['engagement', 'top_posts', 'hashtags', 'frequency', 'profile_history', 'platform_summary']
    }));
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
  // Monitor API (tersedia hanya jika pool / queue dikonfigurasi)
  // ─────────────────────────────────────────────

  app.get('/monitor/health', async () => ({
    ok:        true,
    pool:      pool      ? pool.status()                          : null,
    queue:     jobQueue  ? await jobQueue.stats().catch(() => null) : null,
    scheduler: scheduler ? scheduler.status()                     : null,
    db:        dataStore ? 'connected'                            : 'disabled',
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

    function refresh() { refreshPool(); refreshQueue(); refreshSessions(); refreshSchedules(); }
    refresh();
    setInterval(refresh, 3000);
  </script>
</body>
</html>`;
  });

  return app;
}
