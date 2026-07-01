import { z } from 'zod';
import { SUPPORTED_PLATFORMS } from '../scraper/ScraperService.js';

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

// Schedule API (tersedia hanya jika scheduleStore aktif — dicek oleh caller)
export function registerScheduleRoutes(app, { scheduleStore, scheduler }) {
  // Buat jadwal baru
  app.post('/schedules', async (req, reply) => {
    try {
      const payload = scheduleSchema.parse(req.body || {});
      const { default: cron } = await import('node-cron');
      if (!cron.validate(payload.cronExpr)) {
        reply.code(400);
        return { ok: false, error: `Cron expression tidak valid: "${payload.cronExpr}"` };
      }
      const ws = req.workspace;
      const schedule = await scheduleStore.create({
        ...payload,
        profileName: ws?.qualify(payload.profileName) ?? payload.profileName,
        workspace:   ws?.name ?? 'default',
      });
      if (scheduler) await scheduler.reload(schedule.id);
      reply.code(201);
      return { ok: true, schedule };
    } catch (err) {
      reply.code(err.name === 'ZodError' ? 400 : 500);
      return { ok: false, error: err.message };
    }
  });

  // List jadwal — difilter ke workspace caller
  app.get('/schedules', async (req, reply) => {
    try {
      const { enabled } = req.query;
      const schedules = await scheduleStore.listAll({
        ...(enabled != null ? { enabled: enabled === 'true' } : {}),
        workspace: req.workspace?.name ?? 'default',
      });
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
