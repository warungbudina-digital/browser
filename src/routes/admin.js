import { z } from 'zod';
import { ADMIN_DASHBOARD_HTML } from '../views/adminDashboard.js';

const auditQuerySchema = z.object({
  keyName: z.string().optional(),
  status:  z.enum(['ok', 'error']).optional(),
  limit:   z.coerce.number().int().positive().max(1000).optional(),
  offset:  z.coerce.number().int().min(0).optional(),
  since:   z.coerce.number().optional(),
  until:   z.coerce.number().optional(),
});

// Audit log, key registry, workspace stats, dan dashboard HTML
export function registerAdminRoutes(app, { dataStore, keyStore, auditLogger, rateLimiter }) {
  if (auditLogger) {
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

  if (keyStore && !keyStore.isEmpty()) {
    app.get('/admin/keys', async () => ({
      ok:    true,
      keys:  keyStore.names(),
      usage: rateLimiter ? rateLimiter.status() : null,
    }));
  }

  app.get('/admin/workspaces', async (_, reply) => {
    try {
      const result = { ok: true, current: null, workspaces: [] };

      if (dataStore) {
        const { rows } = await dataStore.pool.query(
          `SELECT workspace,
                  COUNT(*)                                    AS job_count,
                  COUNT(*) FILTER (WHERE status = 'done')    AS done_count,
                  COUNT(*) FILTER (WHERE status = 'failed')  AS failed_count,
                  MAX(created_at)                            AS last_job_at
           FROM scraper_jobs
           GROUP BY workspace
           ORDER BY workspace`
        );
        result.workspaces = rows.map((r) => ({
          name:        r.workspace,
          jobCount:    Number(r.job_count),
          doneCount:   Number(r.done_count),
          failedCount: Number(r.failed_count),
          lastJobAt:   r.last_job_at,
        }));
      }

      return result;
    } catch (err) {
      reply.code(500); return { ok: false, error: err.message };
    }
  });

  app.get('/admin', async (_, reply) => {
    reply.type('text/html');
    return ADMIN_DASHBOARD_HTML;
  });
}
