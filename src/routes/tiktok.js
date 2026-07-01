import path from 'node:path';
import { z } from 'zod';
import { TikTokUploader, SUPPORTED_VIDEO_FORMATS } from '../scraper/platforms/tiktokUpload.js';

const tiktokPublishSchema = z.object({
  profileName: z.string().optional(),
  videoPath:   z.string(),
  description: z.string().max(2200).optional(),
  visibility:  z.enum(['everyone', 'friends', 'only_you']).optional(),
  schedule:    z.string().datetime().optional(),
});

// TikTok publish API (tersedia hanya jika pool + sessionStore aktif — dicek oleh caller)
export function registerTiktokRoutes(app, { config, browser, pool, sessionStore }) {
  // Video harus sudah ada di dalam BROWSER_ARTIFACT_DIR (volume yang sama
  // dipakai oleh service ini) — mencegah videoPath dipakai untuk baca file
  // arbitrary di luar direktori yang dimaksudkan.
  function resolveVideoPath(videoPath) {
    const artifactDir = config.browser.artifactDir;
    const resolved = path.resolve(artifactDir, videoPath);
    if (resolved !== artifactDir && !resolved.startsWith(artifactDir + path.sep)) {
      throw new Error(`videoPath harus berada di dalam ${artifactDir}`);
    }
    const ext = path.extname(resolved).toLowerCase();
    if (!SUPPORTED_VIDEO_FORMATS.has(ext)) {
      throw new Error(`Format video tidak didukung: ${ext || '(tanpa ekstensi)'}`);
    }
    return resolved;
  }

  app.post('/tiktok/publish', async (req, reply) => {
    const jobId = `publish-${Date.now()}`;
    let slot;
    try {
      const payload = tiktokPublishSchema.parse(req.body || {});
      const resolvedPath = resolveVideoPath(payload.videoPath);
      const profileName = req.workspace?.qualify(payload.profileName) ?? payload.profileName ?? 'openclaw';

      const saved = await sessionStore.load(profileName, 'tiktok');
      if (!saved?.length) {
        reply.code(400);
        return { ok: false, error: 'Belum ada session TikTok tersimpan untuk profile ini — import cookies dulu via POST /sessions/:profile/import' };
      }

      slot = await pool.acquire(jobId, 90_000);
      try {
        await browser.dispatch('start', { profile: slot.profile });
      } catch {
        await pool.restartSlot(slot);
        await browser.dispatch('start', { profile: slot.profile });
      }

      const dispatch = (action, p = {}) => browser.dispatch(action, { ...p, profile: slot.profile });
      await dispatch('cookies', { kind: 'set', cookies: saved });

      const uploader = new TikTokUploader();
      const result = await uploader.publish(dispatch, {
        videoPath:   resolvedPath,
        description: payload.description,
        visibility:  payload.visibility,
        schedule:    payload.schedule,
      });

      try {
        const cookiesNow = await dispatch('cookies', { kind: 'get', domain: '.tiktok.com' });
        const cookies = cookiesNow?.cookies ?? cookiesNow ?? [];
        if (Array.isArray(cookies) && cookies.length) {
          const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
          await sessionStore.save(profileName, 'tiktok', cookies, expiresAt);
        }
      } catch (e) {
        req.log?.warn?.(`Gagal simpan session setelah publish: ${e.message}`);
      }

      return { ok: true, ...result };
    } catch (err) {
      reply.code(err.name === 'ZodError' ? 400 : 500);
      return { ok: false, error: err.message };
    } finally {
      if (slot) pool.release(slot);
    }
  });
}
