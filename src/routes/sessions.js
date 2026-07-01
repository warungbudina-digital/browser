import { z } from 'zod';
import { SUPPORTED_PLATFORMS } from '../scraper/ScraperService.js';
import { parseCookiesTxt } from '../scraper/CookiesTxtParser.js';

const importSessionSchema = z.object({
  platform:   z.enum(SUPPORTED_PLATFORMS),
  cookiesTxt: z.string().optional(),
  cookies: z.array(z.object({
    name:     z.string(),
    value:    z.string(),
    domain:   z.string(),
    path:     z.string().optional(),
    expires:  z.number().optional(),
    httpOnly: z.boolean().optional(),
    secure:   z.boolean().optional(),
  })).optional(),
});

// Session API (tersedia hanya jika sessionStore aktif — dicek oleh caller)
export function registerSessionRoutes(app, { browser, sessionStore }) {
  // List session — difilter ke workspace caller (berdasarkan profile name prefix)
  app.get('/sessions', async (req, reply) => {
    try {
      const all = await sessionStore.listAll();
      const ws  = req.workspace;
      const sessions = ws && !ws.isDefault
        ? all.filter((s) => ws.owns(s.profile))
        : all;
      return { ok: true, sessions };
    } catch (err) {
      reply.code(500); return { ok: false, error: err.message };
    }
  });

  // List session per profile (profile di-qualify dengan workspace)
  app.get('/sessions/:profile', async (req, reply) => {
    try {
      const qualifiedProfile = req.workspace?.qualify(req.params.profile) ?? req.params.profile;
      return { ok: true, sessions: await sessionStore.list(qualifiedProfile) };
    } catch (err) {
      reply.code(500); return { ok: false, error: err.message };
    }
  });

  // Hapus session (profile di-qualify dengan workspace)
  app.delete('/sessions/:profile', async (req, reply) => {
    try {
      const qualifiedProfile = req.workspace?.qualify(req.params.profile) ?? req.params.profile;
      const { platform } = req.query;
      await sessionStore.clear(qualifiedProfile, platform ?? null);
      return { ok: true, cleared: { profile: qualifiedProfile, platform: platform ?? 'all' } };
    } catch (err) {
      reply.code(500); return { ok: false, error: err.message };
    }
  });

  // Import session dari cookies.txt (format Netscape, hasil export ekstensi
  // "Get cookies.txt LOCALLY" di browser pribadi user) ATAU array cookie langsung.
  // Cookie disimpan ke SessionStore supaya job scraping berikutnya untuk
  // profile+platform ini otomatis auto-restore (lihat JobQueue.js).
  app.post('/sessions/:profile/import', async (req, reply) => {
    try {
      const body = importSessionSchema.parse(req.body || {});
      if (!body.cookiesTxt && !body.cookies) {
        reply.code(400);
        return { ok: false, error: 'Sertakan salah satu: "cookiesTxt" (format Netscape) atau "cookies" (array)' };
      }

      const cookies = body.cookiesTxt ? parseCookiesTxt(body.cookiesTxt) : body.cookies;
      if (!cookies.length) {
        reply.code(400);
        return { ok: false, error: 'Tidak ada cookie valid yang bisa di-parse dari input' };
      }

      const qualifiedProfile = req.workspace?.qualify(req.params.profile) ?? req.params.profile;

      // Best-effort: inject langsung ke browser context yang aktif kalau profile sudah start.
      // Bukan fatal kalau gagal — SessionStore adalah sumber kebenaran yang di-restore JobQueue
      // sebelum tiap job, jadi cookie tetap akan terpakai di scrape job berikutnya.
      try {
        await browser.dispatch('cookies', { profile: qualifiedProfile, kind: 'set', cookies });
      } catch (e) {
        req.log?.warn?.(`Gagal inject cookies langsung ke browser context aktif: ${e.message}`);
      }

      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await sessionStore.save(qualifiedProfile, body.platform, cookies, expiresAt);

      return { ok: true, profile: qualifiedProfile, platform: body.platform, cookieCount: cookies.length };
    } catch (err) {
      reply.code(err.name === 'ZodError' ? 400 : 500);
      return { ok: false, error: err.message };
    }
  });
}
