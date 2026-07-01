import { z } from 'zod';

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
  frames: z.boolean().optional(),
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

export function registerBrowserRoutes(app, { browser }) {
  app.get('/browser/capabilities', async () => browser.capabilities());
  app.get('/browser/profiles', async (req) => {
    const result = await browser.listProfiles();
    const ws = req.workspace;
    if (ws && !ws.isDefault) {
      result.profiles = result.profiles
        .filter((p) => ws.owns(p.name))
        .map((p) => ({ ...p, name: ws.unqualify(p.name) }));
      if (result.activeProfile) result.activeProfile = ws.unqualify(result.activeProfile);
    }
    return result;
  });

  app.post('/browser/profiles', async (req, reply) => {
    try {
      const payload = profileSchema.parse(req.body || {});
      const ws = req.workspace;

      // Qualify semua name fields dengan workspace namespace
      const qualifyName = (n) => ws?.qualify(n) ?? n;
      const qualifiedName = payload.name ? qualifyName(payload.name) : undefined;
      const qualifiedProfile = payload.profile?.name
        ? { ...payload.profile, name: qualifyName(payload.profile.name) }
        : payload.profile;

      let result;
      switch (payload.action) {
        case 'list':   result = await browser.listProfiles(); break;
        case 'get':    result = await browser.getProfile(qualifiedName); break;
        case 'create': result = await browser.createProfile(qualifiedProfile || {}); break;
        case 'update': result = await browser.updateProfile(qualifiedName, qualifiedProfile || {}); break;
        case 'remove': result = await browser.removeProfile(qualifiedName); break;
        case 'select': result = await browser.selectProfile(qualifiedName); break;
        default:
          reply.code(400);
          return { ok: false, error: `Unsupported profile action: ${payload.action}` };
      }

      // Unqualify profile names dalam response (agar client tidak tahu tentang namespace internals)
      if (result?.ok && ws && !ws.isDefault) {
        if (result.profile?.name) result.profile.name = ws.unqualify(result.profile.name);
        if (result.activeProfile) result.activeProfile = ws.unqualify(result.activeProfile);
      }
      return result;
    } catch (error) {
      reply.code(500);
      return { ok: false, error: error.message };
    }
  });

  app.post('/browser/request', async (req, reply) => {
    try {
      const payload = requestSchema.parse(req.body || {});
      // Qualify profile name dengan workspace namespace
      const qualifiedProfile = req.workspace?.qualify(payload.profile);
      return await browser.dispatch(payload.action, { ...payload, profile: qualifiedProfile ?? payload.profile });
    } catch (error) {
      reply.code(500);
      return { ok: false, error: error.message };
    }
  });
}
