import Fastify from 'fastify';
import { BrowserManager } from './browser/BrowserManager.js';
import { ScraperService } from './scraper/ScraperService.js';
import { createApiKeyHook } from './middleware/apiKey.js';
import { createAuditHooks } from './middleware/auditHook.js';
import { createRateLimitHook } from './middleware/rateLimitHook.js';
import { createWorkspaceHook } from './middleware/workspaceHook.js';
import { createCorrelationIdHook } from './middleware/correlationId.js';
import { registerBrowserRoutes } from './routes/browser.js';
import { registerScraperRoutes } from './routes/scraper.js';
import { registerSessionRoutes } from './routes/sessions.js';
import { registerTiktokRoutes } from './routes/tiktok.js';
import { registerScheduleRoutes } from './routes/schedules.js';
import { registerMonitorRoutes } from './routes/monitor.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerEventRoutes } from './routes/events.js';

/**
 * Susun Fastify app: hooks lintas-endpoint dulu, lalu route per domain.
 * Semua dependency (store, queue, pool, dst.) dibuat di index.js dan
 * di-inject lewat options — createServer tidak membuat side-effect sendiri
 * selain BrowserManager fallback untuk pemakaian standalone/CLI.
 */
export function createServer(config, { browser: injectedBrowser, dataStore, sessionStore = null, scheduleStore = null, jobQueue = null, pool = null, scheduler = null, metrics = null, alertManager = null, keyStore = null, auditLogger = null, rateLimiter = null, eventBus = null, sseManager = null } = {}) {
  const app       = Fastify({ logger: true });
  const browser   = injectedBrowser ?? new BrowserManager(config.browser);
  const scraper   = dataStore ? new ScraperService(browser, dataStore, jobQueue) : null;
  const startedAt = new Date().toISOString();

  // ── Correlation ID (harus pertama — sebelum semua hook lain) ─────────────
  app.addHook('onRequest', createCorrelationIdHook());

  // ── API key auth ─────────────────────────────────────────────────────────
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

  // ── Workspace context (dipasang setelah auth, sebelum rate limit) ────────
  app.addHook('preHandler', createWorkspaceHook());

  // ── Per-key rate limiting (dipasang setelah auth agar keyName tersedia) ──
  const rateLimitHook = createRateLimitHook(rateLimiter);
  if (rateLimitHook) app.addHook('preHandler', rateLimitHook);

  // ── Routes per domain — modul opsional hanya dipasang jika dependensinya aktif
  const ctx = {
    config, startedAt,
    browser, scraper,
    dataStore, sessionStore, scheduleStore,
    jobQueue, pool, scheduler,
    metrics, alertManager,
    keyStore, auditLogger, rateLimiter,
    eventBus, sseManager,
  };

  registerBrowserRoutes(app, ctx);
  registerMonitorRoutes(app, ctx);
  registerAdminRoutes(app, ctx);
  if (scraper)               registerScraperRoutes(app, ctx);
  if (sessionStore)          registerSessionRoutes(app, ctx);
  if (pool && sessionStore)  registerTiktokRoutes(app, ctx);
  if (scheduleStore)         registerScheduleRoutes(app, ctx);
  if (eventBus && sseManager) registerEventRoutes(app, ctx);

  return app;
}
