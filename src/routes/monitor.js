import { readFileSync } from 'node:fs';

const { version: APP_VERSION } = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
);

// Health, metrics (Prometheus + JSON), liveness/readiness
export function registerMonitorRoutes(app, { startedAt, dataStore, jobQueue, pool, scheduler, metrics, alertManager, sseManager }) {
  app.get('/health', async () => ({ ok: true }));

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

  // Liveness — process is running (used by container orchestrator restart policy)
  app.get('/monitor/live', async () => ({ ok: true, ts: new Date().toISOString() }));

  // Readiness — all required dependencies are reachable (used by load-balancer)
  app.get('/monitor/ready', async (_, reply) => {
    const checks = {};
    let ready    = true;

    if (dataStore) {
      try {
        await dataStore.pool.query('SELECT 1');
        checks.db = 'ok';
      } catch (err) {
        checks.db = `error: ${err.message}`;
        ready = false;
      }
    } else {
      checks.db = 'disabled';
    }

    if (!ready) reply.code(503);
    return { ok: ready, checks, ts: new Date().toISOString() };
  });

  app.get('/monitor/health', async () => ({
    ok:             true,
    version:        APP_VERSION,
    startedAt,
    uptimeSeconds:  Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000),
    pid:            process.pid,
    pool:           pool         ? pool.status()                            : null,
    queue:          jobQueue     ? await jobQueue.stats().catch(() => null) : null,
    scheduler:      scheduler    ? scheduler.status()                       : null,
    alerts:         alertManager ? alertManager.status()                    : null,
    db:             dataStore    ? 'connected'                              : 'disabled',
    sse:            sseManager   ? sseManager.status()                      : null,
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
}
