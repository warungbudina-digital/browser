import Fastify from 'fastify';
import { z } from 'zod';
import { BrowserManager } from './browser/BrowserManager.js';

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
    color: z.string().optional()
  }).optional()
});

export function createServer(config) {
  const app = Fastify({ logger: true });
  const browser = new BrowserManager(config.browser);

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

  return app;
}
