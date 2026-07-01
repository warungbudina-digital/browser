import { z } from 'zod';
import { SUPPORTED_PLATFORMS } from '../scraper/ScraperService.js';
import * as analytics from '../scraper/analytics.js';
import {
  EXPORT_FORMATS, EXPORT_TYPES,
  queryPosts, queryProfiles, queryJobs,
  serialize, contentType as exportContentType, filename as exportFilename,
} from '../scraper/Exporter.js';

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

// Scraper API (tersedia hanya jika dataStore dikonfigurasi — dicek oleh caller)
export function registerScraperRoutes(app, { scraper, dataStore }) {
  // Submit scraping job
  app.post('/scraper/jobs', async (req, reply) => {
    try {
      const payload = scraperJobSchema.parse(req.body || {});
      const ws = req.workspace;
      const job = await scraper.submit({
        ...payload,
        profileName: ws?.qualify(payload.profileName) ?? payload.profileName,
        workspace:   ws?.name ?? 'default',
      });
      reply.code(202);
      return { ok: true, job };
    } catch (err) {
      reply.code(err.name === 'ZodError' ? 400 : 500);
      return { ok: false, error: err.message };
    }
  });

  // List jobs — difilter ke workspace caller
  app.get('/scraper/jobs', async (req, reply) => {
    try {
      const { platform, status, limit, offset } = req.query;
      const jobs = await scraper.listJobs({
        platform, status,
        workspace: req.workspace?.name ?? 'default',
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
