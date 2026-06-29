import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from 'patchright';
import { RefStore } from './RefStore.js';
import { FingerprintManager } from './FingerprintManager.js';
import { buildSnapshotFromNodes, collectDomNodes } from './snapshot.js';
import { assertBrowserNavigationAllowed, assertBrowserNavigationResultAllowed, assertCdpEndpointAllowed } from '../security/ssrf.js';

const PAGE_ID = Symbol('page-id');

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function safeFilePart(value) {
  return String(value || 'file').replace(/[^a-zA-Z0-9._-]+/g, '-');
}

export class BrowserService {
  constructor({ profileName, profile, artifactDir, defaultViewport, ssrfPolicy }) {
    this.profileName = profileName;
    this.profile = profile;
    this.artifactDir = artifactDir;
    this.defaultViewport = defaultViewport;
    this.ssrfPolicy = ssrfPolicy;
    this.stealthEnabled = profile.stealth !== false;
    this.refStore = new RefStore();
    this.browser = null;
    this.context = null;
    this.currentTargetId = null;
    this.startedAt = null;
    this.logs = new Map();
    this.traceState = { active: false, options: null };
  }

  async start() {
    if (this.context) return this.status();

    await ensureDir(this.artifactDir);
    if (this.profile.driver === 'managed') {
      await ensureDir(this.profile.profileDir);
      const fp = FingerprintManager.generate(this.profileName);
      this.context = await chromium.launchPersistentContext(this.profile.profileDir, {
        headless: this.profile.headless !== false,
        viewport: this.stealthEnabled ? fp.viewport : this.defaultViewport,
        executablePath: this.profile.executablePath,
        channel: this.profile.channel,
        userAgent: this.profile.userAgent || (this.stealthEnabled ? fp.userAgent : undefined),
        locale: this.stealthEnabled ? fp.locale : undefined,
        timezoneId: this.stealthEnabled ? fp.timezoneId : undefined,
        geolocation: this.stealthEnabled ? fp.geolocation : undefined,
        permissions: this.stealthEnabled ? ['geolocation'] : undefined,
        colorScheme: this.stealthEnabled ? fp.colorScheme : undefined,
        proxy: this.profile.proxy || undefined,
        args: ['--disable-dev-shm-usage']
      });
    } else if (this.profile.driver === 'remote-cdp') {
      await assertCdpEndpointAllowed(this.profile.cdpUrl, this.ssrfPolicy);
      this.browser = await chromium.connectOverCDP(this.profile.cdpUrl);
      this.context = this.browser.contexts()[0] || await this.browser.newContext({ viewport: this.defaultViewport });
    } else {
      throw new Error(`Unsupported profile driver: ${this.profile.driver}`);
    }

    this.startedAt = new Date().toISOString();
    this.context.on('page', (page) => this.#registerPage(page));
    for (const page of this.context.pages()) this.#registerPage(page);
    if (this.context.pages().length === 0) this.#registerPage(await this.context.newPage());
    if (!this.currentTargetId) this.currentTargetId = this.#pageId(this.context.pages()[0]);
    return this.status();
  }

  async stop() {
    if (this.context && this.traceState.active) {
      await this.context.tracing.stop({ path: path.join(this.artifactDir, `${Date.now()}-auto-stop-trace.zip`) }).catch(() => {});
    }
    this.traceState = { active: false, options: null };
    this.refStore.clearAll();
    this.logs.clear();
    this.currentTargetId = null;
    this.startedAt = null;

    if (this.context && this.profile.driver === 'managed') await this.context.close();
    else if (this.browser) await this.browser.close();

    this.browser = null;
    this.context = null;
    return { ok: true, stopped: true, profileName: this.profileName };
  }

  async status() {
    return {
      ok: true,
      running: Boolean(this.context),
      profileName: this.profileName,
      profileDriver: this.profile.driver,
      startedAt: this.startedAt,
      currentTargetId: this.currentTargetId,
      targetCount: this.context?.pages().length || 0,
      headless: this.profile.driver === 'managed' ? this.profile.headless !== false : null,
      mode: this.profile.driver,
      traceActive: this.traceState.active,
      stealth: this.stealthEnabled,
      proxy: this.profile.proxy ? { server: this.profile.proxy.server } : null
    };
  }

  async tabs() {
    await this.start();
    return {
      ok: true,
      profileName: this.profileName,
      currentTargetId: this.currentTargetId,
      tabs: await Promise.all(this.context.pages().map(async (page) => ({
        targetId: this.#pageId(page),
        title: await page.title().catch(() => ''),
        url: page.url(),
        active: this.#pageId(page) === this.currentTargetId
      })))
    };
  }

  async open(url) {
    await assertBrowserNavigationAllowed({ url, ssrfPolicy: this.ssrfPolicy });
    await this.start();
    const page = await this.context.newPage();
    this.#registerPage(page);
    const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
    await this.#assertResponseAllowed(page, response);
    const targetId = this.#pageId(page);
    this.currentTargetId = targetId;
    return { ok: true, profileName: this.profileName, targetId, url: page.url(), title: await page.title() };
  }

  async navigate(url, targetId) {
    await assertBrowserNavigationAllowed({ url, ssrfPolicy: this.ssrfPolicy });
    const page = await this.#getPage(targetId);
    const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
    await this.#assertResponseAllowed(page, response);
    this.currentTargetId = this.#pageId(page);
    return { ok: true, profileName: this.profileName, targetId: this.#pageId(page), url: page.url(), title: await page.title() };
  }

  async focus(targetId) {
    const page = await this.#getPage(targetId);
    await page.bringToFront();
    this.currentTargetId = this.#pageId(page);
    return { ok: true, profileName: this.profileName, targetId: this.currentTargetId };
  }

  async close(targetId) {
    const page = await this.#getPage(targetId);
    const id = this.#pageId(page);
    await page.close();
    this.refStore.clearTarget(id);
    this.logs.delete(id);
    const next = this.context.pages()[0];
    this.currentTargetId = next ? this.#pageId(next) : null;
    return { ok: true, profileName: this.profileName, closed: id, currentTargetId: this.currentTargetId };
  }

  async snapshot({ targetId, interactive = false, selector, limit = 150 }) {
    const page = await this.#getPage(targetId);
    const nodes = await collectDomNodes(page, selector);
    const snapshot = buildSnapshotFromNodes({
      targetId: this.#pageId(page),
      url: page.url(),
      title: await page.title(),
      nodes,
      interactive,
      limit
    });
    this.refStore.setSnapshot(this.#pageId(page), snapshot);
    return { ok: true, profileName: this.profileName, ...snapshot };
  }

  async screenshot({ targetId, ref, selector, fullPage = false, path: outputPath }) {
    const page = await this.#getPage(targetId);
    const filePath = outputPath || path.join(this.artifactDir, `${Date.now()}-${safeFilePart(ref || selector || this.#pageId(page))}.png`);
    if (ref || selector) {
      const locator = await this.#resolveLocator(page, ref, selector);
      await locator.screenshot({ path: filePath });
    } else {
      await page.screenshot({ path: filePath, fullPage });
    }
    return { ok: true, profileName: this.profileName, path: filePath, targetId: this.#pageId(page) };
  }

  async pdf({ targetId, path: outputPath }) {
    const page = await this.#getPage(targetId);
    const filePath = outputPath || path.join(this.artifactDir, `${Date.now()}-${safeFilePart(this.#pageId(page))}.pdf`);
    await page.pdf({ path: filePath, printBackground: true });
    return { ok: true, profileName: this.profileName, path: filePath, targetId: this.#pageId(page) };
  }

  async upload({ targetId, ref, selector, paths }) {
    const page = await this.#getPage(targetId);
    if (!Array.isArray(paths) || paths.length === 0) throw new Error('upload requires paths');
    const locator = await this.#resolveLocator(page, ref, selector);
    await locator.setInputFiles(paths);
    return { ok: true, profileName: this.profileName, targetId: this.#pageId(page), uploaded: paths };
  }

  async download({ targetId, ref, selector, path: outputPath, suggestedFilename, timeoutMs }) {
    const page = await this.#getPage(targetId);
    const locator = await this.#resolveLocator(page, ref, selector);
    const download = await this.#waitForDownload(async () => {
      await locator.click({ timeout: timeoutMs });
    }, timeoutMs);
    const fallbackName = suggestedFilename || await download.suggestedFilename().catch(() => 'download.bin');
    const filePath = outputPath || path.join(this.artifactDir, `${Date.now()}-${safeFilePart(fallbackName)}`);
    await download.saveAs(filePath);
    await this.#assertCurrentUrlAllowed(page);
    return {
      ok: true,
      profileName: this.profileName,
      targetId: this.#pageId(page),
      path: filePath,
      suggestedFilename: fallbackName,
      url: download.url()
    };
  }

  async trace({ traceAction, path: outputPath, screenshots = true, snapshots = true, sources = true, title }) {
    await this.start();
    if (traceAction === 'start') {
      if (this.traceState.active) return { ok: true, profileName: this.profileName, traceActive: true, alreadyActive: true };
      await this.context.tracing.start({ screenshots, snapshots, sources, title });
      this.traceState = { active: true, options: { screenshots, snapshots, sources, title } };
      return { ok: true, profileName: this.profileName, traceActive: true, started: true, options: this.traceState.options };
    }
    if (traceAction === 'stop') {
      if (!this.traceState.active) return { ok: true, profileName: this.profileName, traceActive: false, stopped: false };
      const filePath = outputPath || path.join(this.artifactDir, `${Date.now()}-trace.zip`);
      await this.context.tracing.stop({ path: filePath });
      this.traceState = { active: false, options: null };
      return { ok: true, profileName: this.profileName, traceActive: false, stopped: true, path: filePath };
    }
    throw new Error(`Unsupported trace action: ${traceAction}`);
  }

  async console({ targetId, level, clear = false }) {
    const page = await this.#getPage(targetId);
    const store = this.logs.get(this.#pageId(page));
    const items = (store?.console || []).filter((entry) => !level || entry.level === level);
    if (clear && store) store.console = [];
    return { ok: true, profileName: this.profileName, items };
  }

  async errors({ targetId, clear = false }) {
    const page = await this.#getPage(targetId);
    const store = this.logs.get(this.#pageId(page));
    const items = store?.errors || [];
    if (clear && store) store.errors = [];
    return { ok: true, profileName: this.profileName, items };
  }

  async requests({ targetId, filter, clear = false }) {
    const page = await this.#getPage(targetId);
    const store = this.logs.get(this.#pageId(page));
    const items = (store?.requests || []).filter((entry) => !filter || entry.url.includes(filter));
    if (clear && store) store.requests = [];
    return { ok: true, profileName: this.profileName, items };
  }

  async dialog({ targetId, accept = true, promptText }) {
    const page = await this.#getPage(targetId);
    const store = this.logs.get(this.#pageId(page));
    const pending = store?.dialog;
    if (!pending) return { ok: true, profileName: this.profileName, handled: false, reason: 'no pending dialog' };
    if (accept) await pending.accept(promptText); else await pending.dismiss();
    store.dialog = null;
    return { ok: true, profileName: this.profileName, handled: true };
  }

  async act({ targetId, request }) {
    const page = await this.#getPage(targetId || request.targetId);
    switch (request.kind) {
      case 'click': {
        const locator = await this.#resolveLocator(page, request.ref, request.selector);
        if (this.stealthEnabled) {
          await this.#humanDelay(50, 180);
          await this.#humanMouseMove(page, locator);
          await this.#humanDelay(30, 100);
        }
        if (request.doubleClick) await locator.dblclick({ timeout: request.timeoutMs });
        else await locator.click({ timeout: request.timeoutMs, button: request.button || 'left', modifiers: request.modifiers, delay: request.delayMs });
        await this.#assertCurrentUrlAllowed(page);
        return { ok: true, profileName: this.profileName, kind: request.kind, targetId: this.#pageId(page) };
      }
      case 'type': {
        const locator = await this.#resolveLocator(page, request.ref, request.selector);
        if (this.stealthEnabled) {
          await this.#humanDelay(50, 150);
          await this.#humanMouseMove(page, locator);
        }
        await locator.click({ timeout: request.timeoutMs });
        if (this.stealthEnabled) await this.#humanDelay(80, 250);
        try {
          await locator.fill('');
          if (request.slowly) await locator.pressSequentially(request.text, { timeout: request.timeoutMs });
          else await locator.fill(request.text, { timeout: request.timeoutMs });
        } catch {
          await page.keyboard.type(request.text);
        }
        if (request.submit) {
          if (this.stealthEnabled) await this.#humanDelay(100, 300);
          await page.keyboard.press('Enter');
        }
        await this.#assertCurrentUrlAllowed(page);
        return { ok: true, profileName: this.profileName, kind: request.kind, targetId: this.#pageId(page) };
      }
      case 'press':
        if (this.stealthEnabled) await this.#humanDelay(30, 100);
        await page.keyboard.press(request.key, request.delayMs ? { delay: request.delayMs } : undefined);
        await this.#assertCurrentUrlAllowed(page);
        return { ok: true, profileName: this.profileName, kind: request.kind, targetId: this.#pageId(page) };
      case 'hover': {
        const locator = await this.#resolveLocator(page, request.ref, request.selector);
        await locator.hover({ timeout: request.timeoutMs });
        return { ok: true, profileName: this.profileName, kind: request.kind };
      }
      case 'scrollIntoView': {
        const locator = await this.#resolveLocator(page, request.ref, request.selector);
        await locator.scrollIntoViewIfNeeded({ timeout: request.timeoutMs });
        return { ok: true, profileName: this.profileName, kind: request.kind };
      }
      case 'drag': {
        const start = await this.#resolveLocator(page, request.startRef, request.startSelector);
        const end = await this.#resolveLocator(page, request.endRef, request.endSelector);
        await start.dragTo(end, { timeout: request.timeoutMs });
        return { ok: true, profileName: this.profileName, kind: request.kind };
      }
      case 'select': {
        const locator = await this.#resolveLocator(page, request.ref, request.selector);
        await locator.selectOption(request.values, { timeout: request.timeoutMs });
        return { ok: true, profileName: this.profileName, kind: request.kind };
      }
      case 'fill': {
        for (const field of request.fields) {
          const locator = await this.#resolveLocator(page, field.ref, field.selector);
          await locator.fill(field.value ?? '');
        }
        return { ok: true, profileName: this.profileName, kind: request.kind, count: request.fields.length };
      }
      case 'resize':
        await page.setViewportSize({ width: request.width, height: request.height });
        return { ok: true, profileName: this.profileName, kind: request.kind, width: request.width, height: request.height };
      case 'wait':
        if (request.timeMs) await page.waitForTimeout(request.timeMs);
        if (request.selector) await page.locator(request.selector).first().waitFor({ state: 'visible', timeout: request.timeoutMs });
        if (request.text) await page.getByText(request.text, { exact: false }).first().waitFor({ state: 'visible', timeout: request.timeoutMs });
        if (request.textGone) await page.waitForFunction((text) => !document.body?.innerText?.includes(text), request.textGone, { timeout: request.timeoutMs });
        if (request.url) await page.waitForURL(request.url, { timeout: request.timeoutMs });
        if (request.loadState) await page.waitForLoadState(request.loadState, { timeout: request.timeoutMs });
        if (request.fn) await page.waitForFunction(`() => Boolean((${request.fn})())`, undefined, { timeout: request.timeoutMs });
        await this.#assertCurrentUrlAllowed(page);
        return { ok: true, profileName: this.profileName, kind: request.kind };
      case 'evaluate': {
        if (request.ref) {
          const locator = await this.#resolveLocator(page, request.ref, request.selector);
          const result = await locator.evaluate((element, fnSource) => {
            const fn = new Function('element', `return (${fnSource})(element);`);
            return fn(element);
          }, request.fn);
          return { ok: true, profileName: this.profileName, kind: request.kind, result };
        }
        const result = await page.evaluate((fnSource) => {
          const fn = new Function(`return (${fnSource})();`);
          return fn();
        }, request.fn);
        return { ok: true, profileName: this.profileName, kind: request.kind, result };
      }
      case 'close':
        return this.close(this.#pageId(page));
      case 'batch': {
        const results = [];
        for (const action of request.actions) {
          try {
            results.push(await this.act({ targetId: this.#pageId(page), request: action }));
          } catch (error) {
            results.push({ ok: false, profileName: this.profileName, kind: action.kind, error: error.message });
            if (request.stopOnError) throw error;
          }
        }
        return { ok: true, profileName: this.profileName, kind: request.kind, results };
      }
      default:
        throw new Error(`Unsupported act kind: ${request.kind}`);
    }
  }

  #pageId(page) {
    if (!page[PAGE_ID]) page[PAGE_ID] = crypto.randomUUID();
    return page[PAGE_ID];
  }

  async #getPage(targetId) {
    await this.start();
    const resolvedTargetId = targetId || this.currentTargetId;
    const page = this.context.pages().find((entry) => this.#pageId(entry) === resolvedTargetId) || this.context.pages()[0];
    if (!page) throw new Error('No browser page is available');
    this.currentTargetId = this.#pageId(page);
    return page;
  }

  #registerPage(page) {
    const targetId = this.#pageId(page);
    if (this.logs.has(targetId)) return;
    this.logs.set(targetId, { console: [], errors: [], requests: [], dialog: null });
    page.on('console', (message) => this.logs.get(targetId)?.console.push({ level: message.type(), text: message.text(), at: new Date().toISOString() }));
    page.on('pageerror', (error) => this.logs.get(targetId)?.errors.push({ message: error.message, stack: error.stack, at: new Date().toISOString() }));
    page.on('requestfinished', async (request) => {
      try {
        const response = await request.response();
        this.logs.get(targetId)?.requests.push({ method: request.method(), url: request.url(), status: response?.status() || null, at: new Date().toISOString() });
      } catch {
        this.logs.get(targetId)?.requests.push({ method: request.method(), url: request.url(), status: null, at: new Date().toISOString() });
      }
    });
    page.on('dialog', (dialog) => {
      const store = this.logs.get(targetId);
      if (!store) return;
      store.dialog = dialog;
      store.console.push({ level: 'dialog', text: `${dialog.type()}: ${dialog.message()}`, at: new Date().toISOString() });
    });
    page.on('close', () => {
      this.logs.delete(targetId);
      this.refStore.clearTarget(targetId);
    });
  }

  async #resolveLocator(page, ref, selector) {
    if (selector) return page.locator(selector).first();
    if (!ref) throw new Error('A ref or selector is required');
    const resolved = this.refStore.getRef(this.#pageId(page), ref);
    if (!resolved) throw new Error(`Unknown ref: ${ref}. Re-run snapshot first.`);
    const { recipe } = resolved;
    if (recipe.role && recipe.name) return page.getByRole(recipe.role, { name: recipe.name, exact: true }).nth(recipe.nth || 0);
    return page.locator(recipe.selector).first();
  }

  async #assertResponseAllowed(page, response) {
    const finalUrl = page.url() || response?.url() || '';
    await assertBrowserNavigationResultAllowed({ url: finalUrl, ssrfPolicy: this.ssrfPolicy });
  }

  async #assertCurrentUrlAllowed(page) {
    await assertBrowserNavigationResultAllowed({ url: page.url(), ssrfPolicy: this.ssrfPolicy });
  }

  async #waitForDownload(trigger, timeoutMs) {
    const page = await this.#getPage();
    const eventPromise = page.waitForEvent('download', { timeout: timeoutMs ?? 30000 });
    await trigger();
    return eventPromise;
  }

  async #humanDelay(minMs, maxMs) {
    const ms = Math.floor(Math.random() * (maxMs - minMs) + minMs);
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  async #humanMouseMove(page, locator) {
    try {
      const box = await locator.boundingBox({ timeout: 2000 });
      if (!box) return;
      const x = box.x + box.width * (0.25 + Math.random() * 0.5);
      const y = box.y + box.height * (0.25 + Math.random() * 0.5);
      await page.mouse.move(x, y, { steps: Math.floor(8 + Math.random() * 10) });
    } catch {
      // best-effort — jangan block action utama
    }
  }
}
