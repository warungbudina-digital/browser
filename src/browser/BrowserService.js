import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from 'patchright';
import { RefStore } from './RefStore.js';
import { FingerprintManager } from './FingerprintManager.js';
import { RateLimiter } from './RateLimiter.js';
import { withRetry } from './RetryManager.js';
import { buildSnapshotFromNodes, collectDomNodes, collectFrameNodes } from './snapshot.js';
import {
  textCollector, metaCollector, linksCollector,
  buildTextContent, buildMetadata, buildLinks,
} from './ContentExtractor.js';
import { diff, diffText } from './SnapshotDiff.js';
import {
  sessionFilename, serializeSession, parseSessionFile, filterExpiredCookies,
} from './SessionPersistence.js';
import { assertBrowserNavigationAllowed, assertBrowserNavigationResultAllowed, assertCdpEndpointAllowed } from '../security/ssrf.js';
import { InterceptManager, matchesPattern } from './InterceptManager.js';
import { HarRecorder } from './HarRecorder.js';
import { EventRecorder } from './EventRecorder.js';
import { DeviceEmulator } from './DeviceEmulator.js';
import { ResponseTransformer, applyTransforms } from './ResponseTransformer.js';
import { storageFilename, serializeStorage, parseStorageFile } from './StoragePersistence.js';
import { filterByDomain, filterByName, filterByPath, filterExpired, groupByDomain, formatNetscape } from './CookieFilter.js';
import { GeolocationEmulator } from './GeolocationEmulator.js';
import { NetworkThrottleManager } from './NetworkThrottleManager.js';
import { PermissionManager } from './PermissionManager.js';
import { filterByLevel, filterByPattern, filterSince as consoleSince, filterBefore as consoleBefore, summarize as consoleSummarize } from './ConsoleFilter.js';
import { filterByMethod, filterByUrl, filterByStatus, filterByStatusRange, filterSince as requestSince, filterBefore as requestBefore, summarize as requestSummarize } from './RequestFilter.js';
import { parseNavigationTiming, parsePaintTiming, mergeMetrics } from './PageMetrics.js';
import { filterByMessage, filterByStack, filterSince as errorSince, filterBefore as errorBefore, groupByOrigin, deduplicateByMessage, summarize as errorSummarize } from './ErrorFilter.js';
import { LocaleEmulator } from './LocaleEmulator.js';
import { ResourceBlocker, VALID_RESOURCE_TYPES } from './ResourceBlocker.js';
import { HeaderRuleManager } from './HeaderRuleManager.js';
import { ViewportManager } from './ViewportManager.js';
import { MediaEmulator, MEDIA_FEATURES, VALID_MEDIA_TYPES } from './MediaEmulator.js';
import { BasicAuthManager } from './BasicAuthManager.js';
import { InitScriptManager } from './InitScriptManager.js';
import { flattenTree, findByRole as axFindByRole, findByName as axFindByName, findMissingNames, findHeadingOrderViolations, findDisabled, summarize as axSummarize } from './AccessibilityAudit.js';
import { filterByUrl as navFilterByUrl, filterByTitle as navFilterByTitle, filterSince as navSince, filterBefore as navBefore, deduplicateConsecutive, groupByUrl as navGroupByUrl, summarize as navSummarize, formatText as navFormatText } from './NavigationTracker.js';
import { filterByKey as lsFilterByKey, filterByValue as lsFilterByValue, search as lsSearch, toObject as lsToObject, fromObject as lsFromObject, summarize as lsSummarize } from './LocalStorageManager.js';
import { filterByKey as ssFilterByKey, filterByValue as ssFilterByValue, search as ssSearch, toObject as ssToObject, fromObject as ssFromObject, summarize as ssSummarize } from './SessionStorageManager.js';
import { ScrollManager } from './ScrollManager.js';
import { CSSOverrideManager, styleElementId } from './CSSOverrideManager.js';
import { filterByKey as idbFilterByKey, filterByStore as idbFilterByStore, summarize as idbSummarize } from './IndexedDBManager.js';
import { filterByOp as cbFilterByOp, filterByText as cbFilterByText, filterSince as cbFilterSince, summarize as cbSummarize } from './ClipboardManager.js';
import { filterByType as fmFilterByType, filterByName as fmFilterByName, filterRequired as fmFilterRequired, filterDisabled as fmFilterDisabled, summarize as fmSummarize } from './FormManager.js';
import { filterByType as wsFilterByType, filterByUrl as wsFilterByUrl, filterByData as wsFilterByData, filterSince as wsSince, filterBefore as wsBefore, groupByUrl as wsGroupByUrl, summarize as wsSummarize, formatText as wsFormatText } from './WebSocketMonitor.js';

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
    this.rateLimiter = this.stealthEnabled ? new RateLimiter() : null;
    this.browser = null;
    this.context = null;
    this.currentTargetId = null;
    this.startedAt = null;
    this.logs = new Map();
    this.traceState = { active: false, options: null };
    this.interceptManager = new InterceptManager();
    this.responseTransformer = new ResponseTransformer();
    this.interceptorInstalled = false;
    this.harRecorder = new HarRecorder();
    this.eventRecorder = new EventRecorder();
    this.deviceEmulator = new DeviceEmulator();
    this.activeDevice = null;
    this.geoEmulator = new GeolocationEmulator();
    this.networkThrottle = new NetworkThrottleManager();
    this.permissionManager = new PermissionManager();
    this.localeEmulator = new LocaleEmulator();
    this.resourceBlocker = new ResourceBlocker();
    this.headerRuleManager = new HeaderRuleManager();
    this.viewportManager = new ViewportManager();
    this.mediaEmulator = new MediaEmulator();
    this.basicAuthManager = new BasicAuthManager();
    this.initScriptManager = new InitScriptManager();
    this.scrollManager = new ScrollManager();
    this.cssOverrideManager = new CSSOverrideManager();
    this.clipboardHistory = [];
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
    if (this.stealthEnabled) await this.#autoWarmup();
    return this.status();
  }

  async stop() {
    if (this.context && this.traceState.active) {
      await this.context.tracing.stop({ path: path.join(this.artifactDir, `${Date.now()}-auto-stop-trace.zip`) }).catch(() => {});
    }
    this.traceState = { active: false, options: null };
    this.refStore.clearAll();
    this.logs.clear();
    this.harRecorder.clearAll();
    this.eventRecorder.clearAll();
    this.responseTransformer.clear();
    this.activeDevice = null;
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
    if (this.stealthEnabled) await this.rateLimiter.throttle(url);
    const page = await this.context.newPage();
    this.#registerPage(page);
    const response = await withRetry(() => page.goto(url, { waitUntil: 'domcontentloaded' }));
    await this.#assertResponseAllowed(page, response);
    const targetId = this.#pageId(page);
    this.currentTargetId = targetId;
    this.eventRecorder.record(targetId, { kind: 'navigate', url: page.url() });
    return { ok: true, profileName: this.profileName, targetId, url: page.url(), title: await page.title() };
  }

  async navigate(url, targetId) {
    await assertBrowserNavigationAllowed({ url, ssrfPolicy: this.ssrfPolicy });
    if (this.stealthEnabled) await this.rateLimiter.throttle(url);
    const page = await this.#getPage(targetId);
    const response = await withRetry(() => page.goto(url, { waitUntil: 'domcontentloaded' }));
    await this.#assertResponseAllowed(page, response);
    this.currentTargetId = this.#pageId(page);
    this.eventRecorder.record(this.currentTargetId, { kind: 'navigate', url: page.url() });
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

  async snapshot({ targetId, interactive = false, selector, limit = 150, frames = false }) {
    const page = await this.#getPage(targetId);
    const nodes = await collectDomNodes(page, selector);
    const frameEntries = frames ? await collectFrameNodes(page, 50) : [];
    const snapshot = buildSnapshotFromNodes({
      targetId: this.#pageId(page),
      url:      page.url(),
      title:    await page.title(),
      nodes,
      interactive,
      limit,
      frameEntries,
    });
    this.refStore.setSnapshot(this.#pageId(page), snapshot);
    return { ok: true, profileName: this.profileName, ...snapshot };
  }

  async snapdiff({ targetId, interactive = false, selector, limit = 150 }) {
    const page     = await this.#getPage(targetId);
    const pid      = this.#pageId(page);
    const prevSnap = this.refStore.getSnapshot(pid); // current = "before"

    const nodes    = await collectDomNodes(page, selector);
    const newSnap  = buildSnapshotFromNodes({
      targetId: pid, url: page.url(), title: await page.title(),
      nodes, interactive, limit,
    });
    this.refStore.setSnapshot(pid, newSnap);

    if (!prevSnap) {
      return { ok: true, profileName: this.profileName, ...newSnap, diff: null, diffText: null };
    }

    const diffResult = diff(prevSnap, newSnap);
    return {
      ok: true, profileName: this.profileName, ...newSnap,
      diff: diffResult,
      diffText: diffText(diffResult),
    };
  }

  async extract({ targetId, kind = 'text' }) {
    const page = await this.#getPage(targetId);
    const url   = page.url();
    const title = await page.title();
    const pid   = this.#pageId(page);

    if (kind === 'meta') {
      const raw = await page.evaluate(metaCollector);
      return { ok: true, profileName: this.profileName, targetId: pid, url, title, kind, ...buildMetadata(raw) };
    }
    if (kind === 'links') {
      const raw = await page.evaluate(linksCollector);
      return { ok: true, profileName: this.profileName, targetId: pid, url, title, kind, ...buildLinks(raw, url) };
    }
    if (kind === 'full') {
      const [rawText, rawMeta, rawLinks] = await Promise.all([
        page.evaluate(textCollector),
        page.evaluate(metaCollector),
        page.evaluate(linksCollector),
      ]);
      return {
        ok: true, profileName: this.profileName, targetId: pid, url, title, kind,
        content:  buildTextContent(rawText),
        metadata: buildMetadata(rawMeta),
        links:    buildLinks(rawLinks, url),
      };
    }
    // default: 'text'
    const raw = await page.evaluate(textCollector);
    return { ok: true, profileName: this.profileName, targetId: pid, url, title, kind, ...buildTextContent(raw) };
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

  /**
   * Warmup eksplisit — jalankan di halaman aktif sebelum scraping.
   * Simulasi mouse movement + scroll agar tampak seperti user yang membaca halaman.
   */
  async warmup() {
    await this.start();
    const page = await this.#getPage();
    try {
      const size = page.viewportSize() ?? { width: 1280, height: 720 };
      const moves = 3 + Math.floor(Math.random() * 4);
      for (let i = 0; i < moves; i++) {
        await page.mouse.move(
          100 + Math.random() * (size.width - 200),
          80 + Math.random() * (size.height - 160),
          { steps: 5 + Math.floor(Math.random() * 8) }
        );
        await this.#humanDelay(100, 450);
      }
      // Simulasi scroll membaca: turun lalu naik sedikit
      const scrollY = 80 + Math.floor(Math.random() * 250);
      await page.evaluate((y) => window.scrollBy({ top: y, behavior: 'smooth' }), scrollY);
      await this.#humanDelay(500, 1400);
      await page.evaluate((y) => window.scrollBy({ top: -Math.floor(y * 0.6), behavior: 'smooth' }), scrollY);
      await this.#humanDelay(200, 600);
    } catch {
      // best-effort — jangan block caller
    }
    return { ok: true, profileName: this.profileName, warmedUp: true };
  }

  /**
   * Cookie management eksplisit.
   * kind='get'   → list cookies untuk URL halaman aktif (atau semua jika tanpa targetId)
   * kind='set'   → inject cookies ke context (berguna untuk restore session)
   * kind='clear' → hapus cookies, optional filter domain
   */
  async cookies({ targetId, kind, cookies: cookieList, domain } = {}) {
    await this.start();
    switch (kind) {
      case 'get': {
        const urls = [];
        if (targetId) {
          const page = await this.#getPage(targetId);
          urls.push(page.url());
        }
        const result = await this.context.cookies(urls.length ? urls : undefined);
        return { ok: true, profileName: this.profileName, cookies: result };
      }
      case 'set': {
        if (!Array.isArray(cookieList) || cookieList.length === 0) throw new Error('cookies array wajib untuk kind=set');
        await this.context.addCookies(cookieList);
        return { ok: true, profileName: this.profileName, added: cookieList.length };
      }
      case 'clear': {
        await this.context.clearCookies(domain ? { domain } : undefined);
        if (this.stealthEnabled) this.rateLimiter.reset();
        return { ok: true, profileName: this.profileName, cleared: true };
      }
      default:
        throw new Error(`Unsupported cookies kind: ${kind}. Gunakan: get | set | clear`);
    }
  }

  get #sessionsDir() {
    return path.join(this.artifactDir, 'sessions');
  }

  get #storageBaseDir() {
    return path.join(this.artifactDir, 'storage');
  }

  async sessionSave({ name }) {
    const fname = sessionFilename(name);
    await this.start();
    await ensureDir(this.#sessionsDir);
    const state = await this.context.storageState();
    const data  = serializeSession(state, { profile: this.profileName });
    await fs.writeFile(path.join(this.#sessionsDir, fname), JSON.stringify(data, null, 2), 'utf8');
    return { ok: true, profileName: this.profileName, name, cookieCount: data.cookieCount, originCount: data.originCount };
  }

  async sessionLoad({ name }) {
    const fname    = sessionFilename(name);
    const filePath = path.join(this.#sessionsDir, fname);
    const raw      = JSON.parse(await fs.readFile(filePath, 'utf8'));
    const parsed   = parseSessionFile(raw);
    await this.start();
    const validCookies = filterExpiredCookies(parsed.cookies);
    if (validCookies.length) await this.context.addCookies(validCookies);
    return {
      ok: true, profileName: this.profileName, name,
      cookieCount: validCookies.length,
      expiredSkipped: parsed.cookies.length - validCookies.length,
    };
  }

  async sessionList() {
    try {
      const files = await fs.readdir(this.#sessionsDir);
      const sessions = files
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.slice(0, -5));
      return { ok: true, profileName: this.profileName, sessions };
    } catch {
      return { ok: true, profileName: this.profileName, sessions: [] };
    }
  }

  async sessionDelete({ name }) {
    const fname = sessionFilename(name);
    await fs.unlink(path.join(this.#sessionsDir, fname));
    return { ok: true, profileName: this.profileName, deleted: name };
  }

  // ── Web Storage Persistence (Phase 25) ───────────────────────────────────────

  async storageSave({ name, kind = 'localStorage', targetId } = {}) {
    const fname = storageFilename(name);
    await this.start();
    const dir  = path.join(this.#storageBaseDir, kind);
    await ensureDir(dir);
    const page = await this.#getPage(targetId);
    const raw  = await page.evaluate((k) => {
      const store = k === 'localStorage' ? window.localStorage : window.sessionStorage;
      const result = {};
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        result[key] = store.getItem(key);
      }
      return result;
    }, kind);
    const data = serializeStorage(raw, { profile: this.profileName, kind });
    await fs.writeFile(path.join(dir, fname), JSON.stringify(data, null, 2), 'utf8');
    return { ok: true, profileName: this.profileName, name, kind, entryCount: data.entryCount };
  }

  async storageLoad({ name, kind = 'localStorage', targetId } = {}) {
    const fname    = storageFilename(name);
    const filePath = path.join(this.#storageBaseDir, kind, fname);
    const raw      = JSON.parse(await fs.readFile(filePath, 'utf8'));
    const parsed   = parseStorageFile(raw);
    await this.start();
    const page = await this.#getPage(targetId);
    if (parsed.entries.length > 0) {
      await page.evaluate(([k, entries]) => {
        const store = k === 'localStorage' ? window.localStorage : window.sessionStorage;
        entries.forEach(({ key, value }) => store.setItem(key, value));
      }, [kind, parsed.entries]);
    }
    return { ok: true, profileName: this.profileName, name, kind, entryCount: parsed.entries.length };
  }

  async storageList({ kind = 'localStorage' } = {}) {
    try {
      const files = await fs.readdir(path.join(this.#storageBaseDir, kind));
      const names = files.filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
      return { ok: true, profileName: this.profileName, kind, names };
    } catch {
      return { ok: true, profileName: this.profileName, kind, names: [] };
    }
  }

  async storageDelete({ name, kind = 'localStorage' } = {}) {
    const fname = storageFilename(name);
    await fs.unlink(path.join(this.#storageBaseDir, kind, fname));
    return { ok: true, profileName: this.profileName, name, kind, deleted: true };
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
        this.eventRecorder.record(this.#pageId(page), { kind: 'click', selector: request.selector, ref: request.ref });
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
        this.eventRecorder.record(this.#pageId(page), { kind: 'type', selector: request.selector, ref: request.ref, text: request.text });
        return { ok: true, profileName: this.profileName, kind: request.kind, targetId: this.#pageId(page) };
      }
      case 'press':
        if (this.stealthEnabled) await this.#humanDelay(30, 100);
        await page.keyboard.press(request.key, request.delayMs ? { delay: request.delayMs } : undefined);
        await this.#assertCurrentUrlAllowed(page);
        this.eventRecorder.record(this.#pageId(page), { kind: 'press', key: request.key });
        return { ok: true, profileName: this.profileName, kind: request.kind, targetId: this.#pageId(page) };
      case 'hover': {
        const locator = await this.#resolveLocator(page, request.ref, request.selector);
        await locator.hover({ timeout: request.timeoutMs });
        this.eventRecorder.record(this.#pageId(page), { kind: 'hover', selector: request.selector, ref: request.ref });
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
        this.eventRecorder.record(this.#pageId(page), { kind: 'select', selector: request.selector, ref: request.ref, values: request.values });
        return { ok: true, profileName: this.profileName, kind: request.kind };
      }
      case 'fill': {
        for (const field of request.fields) {
          const locator = await this.#resolveLocator(page, field.ref, field.selector);
          await locator.fill(field.value ?? '');
        }
        this.eventRecorder.record(this.#pageId(page), { kind: 'fill', fields: request.fields });
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

  // Sync page lookup — assumes browser is already started.
  #pageFor(targetId) {
    const resolvedTargetId = targetId || this.currentTargetId;
    const page = this.context?.pages().find((p) => this.#pageId(p) === resolvedTargetId)
               || this.context?.pages()[0];
    if (!page) throw new Error('No browser page is available');
    return page;
  }

  // Async page lookup — starts browser if needed.
  async #pageForTarget(targetId) {
    await this.start();
    return this.#pageFor(targetId);
  }

  // Public alias for #pageFor used by methods that assume browser already running.
  _requirePage(targetId) {
    return this.#pageFor(targetId);
  }

  #registerPage(page) {
    const targetId = this.#pageId(page);
    if (this.logs.has(targetId)) return;
    this.logs.set(targetId, { console: [], errors: [], requests: [], ws: [], navigation: [], dialog: null });
    page.on('console', (message) => this.logs.get(targetId)?.console.push({ level: message.type(), text: message.text(), at: new Date().toISOString() }));
    page.on('pageerror', (error) => this.logs.get(targetId)?.errors.push({ message: error.message, stack: error.stack, at: new Date().toISOString() }));
    page.on('framenavigated', async (frame) => {
      if (frame.parentFrame() !== null) return;
      const url = frame.url();
      let title = '';
      try { title = await page.title(); } catch {}
      this.logs.get(targetId)?.navigation.push({ url, title, at: new Date().toISOString() });
    });
    page.on('websocket', (wsConn) => {
      const url = wsConn.url();
      wsConn.on('framesent',     (frame) => this.logs.get(targetId)?.ws.push({ url, type: 'send',    data: String(frame.payload), at: new Date().toISOString() }));
      wsConn.on('framereceived', (frame) => this.logs.get(targetId)?.ws.push({ url, type: 'receive', data: String(frame.payload), at: new Date().toISOString() }));
    });
    page.on('requestfinished', async (request) => {
      try {
        const response = await request.response();
        const status   = response?.status() ?? -1;
        this.logs.get(targetId)?.requests.push({ method: request.method(), url: request.url(), status: status || null, at: new Date().toISOString() });
        const timing    = request.timing();
        const timeMs    = timing?.responseEnd >= 0 ? Math.round(timing.responseEnd) : -1;
        const reqHdrs   = Object.entries(request.headers()).map(([name, value]) => ({ name, value }));
        const resHdrs   = response ? Object.entries(response.headers()).map(([name, value]) => ({ name, value })) : [];
        const mimeType  = (response?.headers()['content-type'] || 'application/octet-stream').split(';')[0].trim() || 'application/octet-stream';
        this.harRecorder.add({ targetId, method: request.method(), url: request.url(), status, mimeType, requestHeaders: reqHdrs, responseHeaders: resHdrs, timeMs });
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
    const { recipe, frameIndex } = resolved;

    // Gunakan frame context untuk iframe refs (frameIndex > 0)
    const ctx = (frameIndex != null && frameIndex > 0)
      ? page.frames()[frameIndex]
      : page;
    if (!ctx) throw new Error(`Frame ${frameIndex} tidak lagi tersedia. Jalankan snapshot ulang.`);

    if (recipe.role && recipe.name) {
      return ctx.getByRole(recipe.role, { name: recipe.name, exact: true }).nth(recipe.nth || 0);
    }
    return ctx.locator(recipe.selector).first();
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

  // Warmup minimal saat browser baru start — establishes input state
  async #autoWarmup() {
    const page = this.context.pages()[0];
    if (!page) return;
    try {
      const size = page.viewportSize() ?? { width: 1280, height: 720 };
      for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) {
        await page.mouse.move(
          100 + Math.random() * (size.width - 200),
          80 + Math.random() * (size.height - 160),
          { steps: 3 + Math.floor(Math.random() * 5) }
        );
        await this.#humanDelay(80, 280);
      }
      await this.#humanDelay(200, 700);
    } catch {
      // best-effort
    }
  }

  // ── Cookie Filter (Phase 26) ─────────────────────────────────────────────────

  async cookieFilter({ targetId, operation, domain, name, path, now } = {}) {
    const { cookies } = await this.cookies({ targetId, kind: 'get' });
    switch (operation) {
      case 'by-domain': return { ok: true, profileName: this.profileName, cookies: filterByDomain(cookies, domain) };
      case 'by-name':   return { ok: true, profileName: this.profileName, cookies: filterByName(cookies, name) };
      case 'by-path':   return { ok: true, profileName: this.profileName, cookies: filterByPath(cookies, path) };
      case 'expired':   return { ok: true, profileName: this.profileName, cookies: filterExpired(cookies, now) };
      case 'group':     return { ok: true, profileName: this.profileName, groups: groupByDomain(cookies) };
      case 'netscape':  return { ok: true, profileName: this.profileName, text: formatNetscape(cookies) };
      default: throw new Error(`Unsupported cookie filter operation: ${operation}. Valid: by-domain, by-name, by-path, expired, group, netscape`);
    }
  }

  // ── Response Transformation (Phase 24) ──────────────────────────────────────

  async transformAdd(payload = {}) {
    await this.start();
    const rule = this.responseTransformer.add(payload);
    await this.#ensureInterceptorInstalled();
    return { ok: true, profileName: this.profileName, rule };
  }

  async transformList() {
    return { ok: true, profileName: this.profileName, rules: this.responseTransformer.list() };
  }

  async transformRemove({ id } = {}) {
    const removed = this.responseTransformer.remove(id);
    return { ok: true, profileName: this.profileName, removed };
  }

  async transformClear() {
    this.responseTransformer.clear();
    return { ok: true, profileName: this.profileName };
  }

  // ── Request Interception (Phase 20) ─────────────────────────────────────────

  async interceptAdd({ pattern, action, response, priority } = {}) {
    await this.start();
    const rule = this.interceptManager.add({ pattern, action, response, priority });
    await this.#ensureInterceptorInstalled();
    return { ok: true, profileName: this.profileName, rule };
  }

  async interceptList() {
    return { ok: true, profileName: this.profileName, rules: this.interceptManager.list() };
  }

  async interceptRemove({ id } = {}) {
    const removed = this.interceptManager.remove(id);
    return { ok: true, profileName: this.profileName, removed };
  }

  async interceptClear() {
    this.interceptManager.clear();
    if (this.context && this.interceptorInstalled) {
      await this.context.unrouteAll?.().catch(() => {});
      this.interceptorInstalled = false;
    }
    return { ok: true, profileName: this.profileName };
  }

  // ── HAR Recording (Phase 21) ─────────────────────────────────────────────────

  async harGet({ targetId, urlFilter, limit, format = 'entries' } = {}) {
    if (format === 'har') {
      return { ok: true, profileName: this.profileName, har: this.harRecorder.toHAR({ targetId }) };
    }
    const entries = this.harRecorder.list({ targetId, urlFilter, limit });
    return { ok: true, profileName: this.profileName, entries, count: entries.length };
  }

  async harClear({ targetId } = {}) {
    const cleared = targetId ? this.harRecorder.clear(targetId) : this.harRecorder.clearAll();
    return { ok: true, profileName: this.profileName, cleared };
  }

  // ── Event Recording (Phase 22) ───────────────────────────────────────────────

  async eventList({ targetId, kind, since, limit } = {}) {
    const events = this.eventRecorder.list({ targetId, kind, since, limit });
    return { ok: true, profileName: this.profileName, events, count: events.length };
  }

  async eventClear({ targetId } = {}) {
    const cleared = targetId ? this.eventRecorder.clear(targetId) : this.eventRecorder.clearAll();
    return { ok: true, profileName: this.profileName, cleared };
  }

  async eventScript({ targetId } = {}) {
    const { steps } = this.eventRecorder.toScript(targetId);
    return { ok: true, profileName: this.profileName, steps, count: steps.length };
  }

  // ── Device Emulation (Phase 23) ──────────────────────────────────────────────

  async deviceEmulate({ name, targetId } = {}) {
    const spec = this.deviceEmulator.resolve(name);
    const page = await this.#getPage(targetId);
    await page.setViewportSize({ width: spec.width, height: spec.height });
    this.activeDevice = spec;
    return { ok: true, profileName: this.profileName, device: spec };
  }

  async deviceReset({ targetId } = {}) {
    const page = await this.#getPage(targetId);
    const vp   = this.defaultViewport ?? { width: 1280, height: 720 };
    await page.setViewportSize(vp);
    this.activeDevice = null;
    return { ok: true, profileName: this.profileName, reset: true, viewport: vp };
  }

  async deviceList() {
    return { ok: true, profileName: this.profileName, devices: this.deviceEmulator.list(), active: this.activeDevice };
  }

  async #ensureInterceptorInstalled() {
    if (this.interceptorInstalled) return;
    this.interceptorInstalled = true;
    await this.context.route('**/*', async (route) => {
      if (this.resourceBlocker.isBlocked(route.request().resourceType())) {
        return route.abort('blockedbyclient');
      }

      const url         = route.request().url();
      const interceptRule = this.interceptManager.match(url);

      if (interceptRule && interceptRule.action === 'block') {
        return route.abort('blockedbyclient');
      }
      if (interceptRule && interceptRule.action === 'mock' && interceptRule.response) {
        const { status = 200, contentType = 'application/json', body = '' } = interceptRule.response;
        return route.fulfill({ status, contentType, body: typeof body === 'string' ? body : JSON.stringify(body) });
      }

      const transformRule = this.responseTransformer.match(url);
      if (transformRule) {
        try {
          const real = await route.fetch();
          const { status, headers, body } = applyTransforms(transformRule.transforms, {
            status:  real.status(),
            headers: real.headers(),
            body:    await real.text(),
          });
          return route.fulfill({ status, headers, body });
        } catch {
          return route.continue();
        }
      }

      const extraHeaders  = this.headerRuleManager.match(url) || {};
      const authInfo      = this.basicAuthManager.match(url);
      if (authInfo && !route.request().headers()['authorization']) {
        extraHeaders['authorization'] = `Basic ${authInfo.token}`;
      }
      if (Object.keys(extraHeaders).length > 0) {
        return route.continue({ headers: { ...route.request().headers(), ...extraHeaders } });
      }

      return route.continue();
    });
  }

  // ── Geolocation Emulation (Phase 27) ─────────────────────────────────────────

  async geoList() {
    const locations = [...this.geoEmulator.list().entries()].map(([name, spec]) => ({ name, ...spec }));
    return { ok: true, presets: this.geoEmulator.presets(), locations, count: locations.length };
  }

  async geoAdd({ name, latitude, longitude, accuracy } = {}) {
    const spec = this.geoEmulator.add(name, { latitude, longitude, accuracy });
    return { ok: true, name: String(name).trim(), spec };
  }

  async geoRemove({ name } = {}) {
    const removed = this.geoEmulator.remove(name);
    return { ok: true, name, removed };
  }

  async geoEmulate({ targetId, name, latitude, longitude, accuracy } = {}) {
    const page = this.#pageFor(targetId);
    const spec  = name != null
      ? this.geoEmulator.resolve(name)
      : this.geoEmulator.validateSpec({ latitude, longitude, accuracy });
    await page.context().grantPermissions(['geolocation']);
    await page.context().setGeolocation({ latitude: spec.latitude, longitude: spec.longitude, accuracy: spec.accuracy });
    return { ok: true, targetId, geolocation: spec };
  }

  async geoReset({ targetId } = {}) {
    const page = this.#pageFor(targetId);
    await page.context().setGeolocation(null);
    return { ok: true, targetId, reset: true };
  }

  // ── Network Throttling (Phase 28) ─────────────────────────────────────────────

  async throttleList() {
    const locations = [...this.networkThrottle.list().entries()].map(([name, spec]) => ({ name, ...spec }));
    return { ok: true, presets: this.networkThrottle.presets(), profiles: locations, count: locations.length };
  }

  async throttleAdd({ name, downloadThroughput, uploadThroughput, latency, offline } = {}) {
    const spec = this.networkThrottle.add(name, { downloadThroughput, uploadThroughput, latency, offline });
    return { ok: true, name: String(name).trim(), spec };
  }

  async throttleRemove({ name } = {}) {
    const removed = this.networkThrottle.remove(name);
    return { ok: true, name, removed };
  }

  async throttleSet({ targetId, name, downloadThroughput, uploadThroughput, latency, offline } = {}) {
    const page = this.#pageFor(targetId);
    const spec  = name != null
      ? this.networkThrottle.resolve(name)
      : this.networkThrottle.validateSpec({ downloadThroughput, uploadThroughput, latency, offline });
    await page.context().setOffline(spec.offline);
    if (!spec.offline) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Network.emulateNetworkConditions', {
        offline:             false,
        downloadThroughput:  spec.downloadThroughput,
        uploadThroughput:    spec.uploadThroughput,
        latency:             spec.latency,
      });
    }
    return { ok: true, targetId, profile: spec };
  }

  async throttleReset({ targetId } = {}) {
    const page = this.#pageFor(targetId);
    await page.context().setOffline(false);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false, downloadThroughput: -1, uploadThroughput: -1, latency: 0,
    });
    return { ok: true, targetId, reset: true };
  }

  // ── Permission Management (Phase 29) ──────────────────────────────────────────

  async permissionGrant({ targetId, permissions } = {}) {
    const page    = this.#pageFor(targetId);
    const granted = this.permissionManager.grant(targetId, permissions);
    await page.context().grantPermissions(granted);
    return { ok: true, targetId, granted };
  }

  async permissionRevoke({ targetId, permissions } = {}) {
    const page      = this.#pageFor(targetId);
    const remaining = this.permissionManager.revoke(targetId, permissions);
    await page.context().clearPermissions();
    if (remaining.length > 0) await page.context().grantPermissions(remaining);
    return { ok: true, targetId, remaining };
  }

  async permissionReset({ targetId } = {}) {
    const page = this.#pageFor(targetId);
    this.permissionManager.reset(targetId);
    await page.context().clearPermissions();
    return { ok: true, targetId, reset: true };
  }

  async permissionList({ targetId } = {}) {
    if (targetId != null) {
      return { ok: true, targetId, permissions: this.permissionManager.list(targetId) };
    }
    return { ok: true, all: this.permissionManager.listAll() };
  }

  // ── Console Filter (Phase 30) ─────────────────────────────────────────────────

  async consoleFilter({ targetId, level, pattern, since, before } = {}) {
    const page  = this.#pageFor(targetId);
    const store = this.logs.get(this.#pageId(page));
    let entries = [...(store?.console || [])];
    if (level   != null) entries = filterByLevel(entries, level);
    if (pattern != null) entries = filterByPattern(entries, pattern);
    if (since   != null) entries = consoleSince(entries, since);
    if (before  != null) entries = consoleBefore(entries, before);
    return { ok: true, targetId, entries, count: entries.length };
  }

  async consoleSummary({ targetId } = {}) {
    const page    = this.#pageFor(targetId);
    const store   = this.logs.get(this.#pageId(page));
    const entries = store?.console || [];
    return { ok: true, targetId, summary: consoleSummarize(entries) };
  }

  // ── Request Filter (Phase 31) ─────────────────────────────────────────────────

  async requestFilter({ targetId, method, url, status, statusRange, since, before } = {}) {
    const page  = this.#pageFor(targetId);
    const store = this.logs.get(this.#pageId(page));
    let entries = [...(store?.requests || [])];
    if (method      != null) entries = filterByMethod(entries, method);
    if (url         != null) entries = filterByUrl(entries, url);
    if (status      != null) entries = filterByStatus(entries, status);
    if (statusRange != null) entries = filterByStatusRange(entries, statusRange[0], statusRange[1]);
    if (since       != null) entries = requestSince(entries, since);
    if (before      != null) entries = requestBefore(entries, before);
    return { ok: true, targetId, entries, count: entries.length };
  }

  async requestSummary({ targetId } = {}) {
    const page    = this.#pageFor(targetId);
    const store   = this.logs.get(this.#pageId(page));
    const entries = store?.requests || [];
    return { ok: true, targetId, summary: requestSummarize(entries) };
  }

  // ── Page Metrics (Phase 32) ───────────────────────────────────────────────────

  // ── Resource Blocking (Phase 35) ─────────────────────────────────────────────

  async resourceBlock({ types } = {}) {
    const blocked = this.resourceBlocker.block(types);
    await this.#ensureInterceptorInstalled();
    return { ok: true, blocked };
  }

  async resourceUnblock({ types } = {}) {
    const blocked = this.resourceBlocker.unblock(types);
    return { ok: true, blocked };
  }

  async resourceList() {
    return { ok: true, blocked: this.resourceBlocker.blockedTypes(), validTypes: [...VALID_RESOURCE_TYPES] };
  }

  async resourceClear() {
    this.resourceBlocker.clear();
    return { ok: true, blocked: [] };
  }

  // ── Header Injection (Phase 36) ───────────────────────────────────────────────

  async headerAdd({ pattern, headers, priority } = {}) {
    const rule = this.headerRuleManager.add({ pattern, headers, priority });
    await this.#ensureInterceptorInstalled();
    return { ok: true, rule };
  }

  async headerList() {
    return { ok: true, rules: this.headerRuleManager.list(), count: this.headerRuleManager.size };
  }

  async headerRemove({ id } = {}) {
    const removed = this.headerRuleManager.remove(id);
    return { ok: true, removed, id };
  }

  async headerClear() {
    this.headerRuleManager.clear();
    return { ok: true, cleared: true };
  }

  // ── Viewport Management (Phase 37) ───────────────────────────────────────────

  async viewportList() {
    return { ok: true, viewports: this.viewportManager.list(), count: this.viewportManager.size };
  }

  async viewportAdd({ name, width, height } = {}) {
    const spec = this.viewportManager.add(name, { width, height });
    return { ok: true, ...spec };
  }

  async viewportRemove({ name } = {}) {
    const removed = this.viewportManager.remove(name);
    return { ok: true, name, removed };
  }

  async viewportSet({ targetId, name, width, height } = {}) {
    const page = await this.#pageForTarget(targetId);
    const spec = this.viewportManager.resolve(name != null ? name : { width, height });
    await page.setViewportSize(spec);
    return { ok: true, ...spec };
  }

  async viewportReset({ targetId } = {}) {
    const page = await this.#pageForTarget(targetId);
    const spec = this.defaultViewport || { width: 1280, height: 720 };
    await page.setViewportSize(spec);
    return { ok: true, reset: true, ...spec };
  }

  // ── Media Emulation (Phase 38) ────────────────────────────────────────────────

  async mediaList() {
    return { ok: true, features: MEDIA_FEATURES, mediaTypes: [...VALID_MEDIA_TYPES] };
  }

  async mediaGet() {
    return { ok: true, ...this.mediaEmulator.toCDP() };
  }

  async mediaSet({ targetId, feature, value, mediaType } = {}) {
    if (feature != null) this.mediaEmulator.setFeature(feature, value);
    if (mediaType != null) this.mediaEmulator.setMediaType(mediaType);
    const page = await this.#pageForTarget(targetId);
    const cdp  = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setEmulatedMedia', this.mediaEmulator.toCDP());
    await cdp.detach();
    return { ok: true, ...this.mediaEmulator.toCDP() };
  }

  async mediaReset({ targetId } = {}) {
    this.mediaEmulator.reset();
    const page = await this.#pageForTarget(targetId);
    const cdp  = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setEmulatedMedia', { media: '', features: [] });
    await cdp.detach();
    return { ok: true, reset: true };
  }

  // ── Basic Auth (Phase 39) ─────────────────────────────────────────────────────

  async authAdd({ pattern, username, password } = {}) {
    const entry = this.basicAuthManager.add({ pattern, username, password });
    return { ok: true, ...entry };
  }

  async authList() {
    return { ok: true, credentials: this.basicAuthManager.list(), count: this.basicAuthManager.size };
  }

  async authRemove({ id } = {}) {
    const removed = this.basicAuthManager.remove(id);
    return { ok: true, id, removed };
  }

  async authClear() {
    this.basicAuthManager.clear();
    return { ok: true, cleared: true };
  }

  // ── WebSocket Monitor (Phase 40) ──────────────────────────────────────────────

  async wsFilter({ targetId, type, url, data, since, before, format, timestamps, group } = {}) {
    const page  = this.#pageFor(targetId);
    const store = this.logs.get(this.#pageId(page));
    let entries = [...(store?.ws || [])];
    if (type   != null) entries = wsFilterByType(entries, type);
    if (url    != null) entries = wsFilterByUrl(entries, url);
    if (data   != null) entries = wsFilterByData(entries, data);
    if (since  != null) entries = wsSince(entries, since);
    if (before != null) entries = wsBefore(entries, before);
    if (group === 'url') return { ok: true, targetId, groups: wsGroupByUrl(entries) };
    if (format === 'text') return { ok: true, targetId, text: wsFormatText(entries, { timestamps: timestamps === true }) };
    return { ok: true, targetId, entries, count: entries.length };
  }

  async wsSummary({ targetId } = {}) {
    const page    = this.#pageFor(targetId);
    const store   = this.logs.get(this.#pageId(page));
    const entries = store?.ws || [];
    return { ok: true, targetId, summary: wsSummarize(entries) };
  }

  async wsClear({ targetId } = {}) {
    const page  = this.#pageFor(targetId);
    const store = this.logs.get(this.#pageId(page));
    if (store) store.ws = [];
    return { ok: true, targetId, cleared: true };
  }

  // ── Init Scripts (Phase 41) ───────────────────────────────────────────────────

  async initAdd({ targetId, name, script } = {}) {
    const entry = this.initScriptManager.add({ name, script });
    if (this.context) {
      const page = await this.#pageForTarget(targetId);
      await page.addInitScript(script);
    }
    return { ok: true, ...entry };
  }

  async initRemove({ id } = {}) {
    const removed = this.initScriptManager.remove(id);
    return { ok: true, id, removed };
  }

  async initList() {
    return { ok: true, scripts: this.initScriptManager.list(), count: this.initScriptManager.size };
  }

  async initClear() {
    this.initScriptManager.clear();
    return { ok: true, cleared: true };
  }

  async initRun({ targetId, script } = {}) {
    if (typeof script !== 'string' || !script.trim()) throw new Error('script must be a non-empty string');
    const page = await this.#pageForTarget(targetId);
    const result = await page.evaluate(script);
    return { ok: true, result: result ?? null };
  }

  // ── Accessibility Audit (Phase 42) ───────────────────────────────────────────

  async axSnapshot({ targetId, role, name: nameFilter } = {}) {
    const page = await this.#pageForTarget(targetId);
    const root = await page.accessibility.snapshot();
    let nodes  = flattenTree(root);
    if (role       != null) nodes = axFindByRole(nodes, role);
    if (nameFilter != null) nodes = axFindByName(nodes, nameFilter);
    return { ok: true, targetId, nodes, count: nodes.length };
  }

  async axAudit({ targetId } = {}) {
    const page     = await this.#pageForTarget(targetId);
    const root     = await page.accessibility.snapshot();
    const nodes    = flattenTree(root);
    const summary  = axSummarize(nodes);
    const disabled = findDisabled(nodes);
    return {
      ok: true,
      targetId,
      total:             summary.total,
      byRole:            summary.byRole,
      missingNames:      summary.missingNames,
      headingViolations: summary.headingViolations,
      disabled,
    };
  }

  // ── Navigation Tracker (Phase 43) ─────────────────────────────────────────────

  async navHistory({ targetId, url, title, since, before, format, timestamps, group, deduplicate } = {}) {
    const page  = this.#pageFor(targetId);
    const store = this.logs.get(this.#pageId(page));
    let entries = [...(store?.navigation || [])];
    if (url         != null) entries = navFilterByUrl(entries, url);
    if (title       != null) entries = navFilterByTitle(entries, title);
    if (since       != null) entries = navSince(entries, since);
    if (before      != null) entries = navBefore(entries, before);
    if (deduplicate)         entries = deduplicateConsecutive(entries);
    if (group === 'url')     return { ok: true, targetId, groups: navGroupByUrl(entries) };
    if (format === 'text')   return { ok: true, targetId, text: navFormatText(entries, { timestamps: timestamps === true }) };
    return { ok: true, targetId, entries, count: entries.length };
  }

  async navSummary({ targetId } = {}) {
    const page    = this.#pageFor(targetId);
    const store   = this.logs.get(this.#pageId(page));
    const entries = store?.navigation || [];
    return { ok: true, targetId, summary: navSummarize(entries) };
  }

  async navClear({ targetId } = {}) {
    const page  = this.#pageFor(targetId);
    const store = this.logs.get(this.#pageId(page));
    if (store) store.navigation = [];
    return { ok: true, targetId, cleared: true };
  }

  // ── LocalStorage Manager (Phase 44) ──────────────────────────────────────────

  async lsGetAll({ targetId, key, value: valuePattern, text } = {}) {
    const page = await this.#pageForTarget(targetId);
    let entries = await page.evaluate(() => Object.entries(localStorage).map(([k, v]) => ({ key: k, value: v })));
    if (key          != null) entries = lsFilterByKey(entries, key);
    if (valuePattern != null) entries = lsFilterByValue(entries, valuePattern);
    if (text         != null) entries = lsSearch(entries, text);
    return { ok: true, targetId, entries, count: entries.length };
  }

  async lsGet({ targetId, key } = {}) {
    if (key == null) throw new Error('key is required');
    const page  = await this.#pageForTarget(targetId);
    const value = await page.evaluate((k) => localStorage.getItem(k), key);
    return { ok: true, targetId, key, value };
  }

  async lsSet({ targetId, key, value } = {}) {
    if (key == null) throw new Error('key is required');
    if (value == null) throw new Error('value is required');
    const page = await this.#pageForTarget(targetId);
    await page.evaluate(([k, v]) => localStorage.setItem(k, String(v)), [key, value]);
    return { ok: true, targetId, key, value: String(value) };
  }

  async lsSetMany({ targetId, entries } = {}) {
    if (!Array.isArray(entries)) throw new Error('entries must be an array');
    const page = await this.#pageForTarget(targetId);
    await page.evaluate((items) => { for (const { key, value } of items) localStorage.setItem(key, value); }, entries);
    return { ok: true, targetId, count: entries.length };
  }

  async lsRemove({ targetId, key } = {}) {
    if (key == null) throw new Error('key is required');
    const page = await this.#pageForTarget(targetId);
    await page.evaluate((k) => localStorage.removeItem(k), key);
    return { ok: true, targetId, key, removed: true };
  }

  async lsClear({ targetId } = {}) {
    const page = await this.#pageForTarget(targetId);
    await page.evaluate(() => localStorage.clear());
    return { ok: true, targetId, cleared: true };
  }

  async lsSummary({ targetId } = {}) {
    const page    = await this.#pageForTarget(targetId);
    const entries = await page.evaluate(() => Object.entries(localStorage).map(([k, v]) => ({ key: k, value: v })));
    return { ok: true, targetId, summary: lsSummarize(entries) };
  }

  async lsExport({ targetId } = {}) {
    const page    = await this.#pageForTarget(targetId);
    const entries = await page.evaluate(() => Object.entries(localStorage).map(([k, v]) => ({ key: k, value: v })));
    return { ok: true, targetId, data: lsToObject(entries) };
  }

  async lsImport({ targetId, data } = {}) {
    if (data == null) throw new Error('data is required');
    const entries = lsFromObject(data);
    const page    = await this.#pageForTarget(targetId);
    await page.evaluate((items) => { for (const { key, value } of items) localStorage.setItem(key, value); }, entries);
    return { ok: true, targetId, count: entries.length };
  }

  // ── Session Storage (Phase 47) ────────────────────────────────────────────────

  async ssGetAll({ targetId, key, value: valuePattern, text } = {}) {
    const page = await this.#pageForTarget(targetId);
    let entries = await page.evaluate(() => Object.entries(sessionStorage).map(([k, v]) => ({ key: k, value: v })));
    if (key          != null) entries = ssFilterByKey(entries, key);
    if (valuePattern != null) entries = ssFilterByValue(entries, valuePattern);
    if (text         != null) entries = ssSearch(entries, text);
    return { ok: true, targetId, entries, count: entries.length };
  }

  async ssGet({ targetId, key } = {}) {
    if (key == null) throw new Error('key is required');
    const page  = await this.#pageForTarget(targetId);
    const value = await page.evaluate((k) => sessionStorage.getItem(k), key);
    return { ok: true, targetId, key, value };
  }

  async ssSet({ targetId, key, value } = {}) {
    if (key == null) throw new Error('key is required');
    if (value == null) throw new Error('value is required');
    const page = await this.#pageForTarget(targetId);
    await page.evaluate(([k, v]) => sessionStorage.setItem(k, String(v)), [key, value]);
    return { ok: true, targetId, key, value: String(value) };
  }

  async ssSetMany({ targetId, entries } = {}) {
    if (!Array.isArray(entries)) throw new Error('entries must be an array');
    const page = await this.#pageForTarget(targetId);
    await page.evaluate((items) => { for (const { key, value } of items) sessionStorage.setItem(key, value); }, entries);
    return { ok: true, targetId, count: entries.length };
  }

  async ssRemove({ targetId, key } = {}) {
    if (key == null) throw new Error('key is required');
    const page = await this.#pageForTarget(targetId);
    await page.evaluate((k) => sessionStorage.removeItem(k), key);
    return { ok: true, targetId, key, removed: true };
  }

  async ssClear({ targetId } = {}) {
    const page = await this.#pageForTarget(targetId);
    await page.evaluate(() => sessionStorage.clear());
    return { ok: true, targetId, cleared: true };
  }

  async ssSummary({ targetId } = {}) {
    const page    = await this.#pageForTarget(targetId);
    const entries = await page.evaluate(() => Object.entries(sessionStorage).map(([k, v]) => ({ key: k, value: v })));
    return { ok: true, targetId, summary: ssSummarize(entries) };
  }

  async ssExport({ targetId } = {}) {
    const page    = await this.#pageForTarget(targetId);
    const entries = await page.evaluate(() => Object.entries(sessionStorage).map(([k, v]) => ({ key: k, value: v })));
    return { ok: true, targetId, data: ssToObject(entries) };
  }

  async ssImport({ targetId, data } = {}) {
    if (data == null) throw new Error('data is required');
    const entries = ssFromObject(data);
    const page    = await this.#pageForTarget(targetId);
    await page.evaluate((items) => { for (const { key, value } of items) sessionStorage.setItem(key, value); }, entries);
    return { ok: true, targetId, count: entries.length };
  }

  // ── Scroll Manager (Phase 45) ─────────────────────────────────────────────────

  async scrollGet({ targetId } = {}) {
    const page = await this.#pageForTarget(targetId);
    const pos  = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
    return { ok: true, targetId, ...pos };
  }

  async scrollTo({ targetId, x = 0, y = 0 } = {}) {
    const page = await this.#pageForTarget(targetId);
    await page.evaluate(([sx, sy]) => window.scrollTo(sx, sy), [x, y]);
    const snapshot = this.scrollManager.record(x, y);
    return { ok: true, targetId, ...snapshot };
  }

  async scrollBy({ targetId, x = 0, y = 0 } = {}) {
    const page = await this.#pageForTarget(targetId);
    await page.evaluate(([dx, dy]) => window.scrollBy(dx, dy), [x, y]);
    const pos = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
    const snapshot = this.scrollManager.record(pos.x, pos.y);
    return { ok: true, targetId, ...snapshot };
  }

  async scrollTop({ targetId } = {}) {
    const page = await this.#pageForTarget(targetId);
    await page.evaluate(() => window.scrollTo(0, 0));
    const snapshot = this.scrollManager.record(0, 0);
    return { ok: true, targetId, ...snapshot };
  }

  async scrollBottom({ targetId } = {}) {
    const page = await this.#pageForTarget(targetId);
    const y    = await page.evaluate(() => document.body.scrollHeight);
    await page.evaluate((sy) => window.scrollTo(0, sy), y);
    const snapshot = this.scrollManager.record(0, y);
    return { ok: true, targetId, ...snapshot };
  }

  async scrollSnapshot({ targetId } = {}) {
    const page = await this.#pageForTarget(targetId);
    const pos  = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
    const snapshot = this.scrollManager.record(pos.x, pos.y);
    return { ok: true, targetId, ...snapshot };
  }

  async scrollHistory({ targetId } = {}) {
    return { ok: true, targetId, snapshots: this.scrollManager.list(), summary: this.scrollManager.summarize() };
  }

  async scrollClear({ targetId } = {}) {
    this.scrollManager.clear();
    return { ok: true, targetId, cleared: true };
  }

  // ── CSS Overrides (Phase 46) ──────────────────────────────────────────────────

  async cssAdd({ targetId, name, css } = {}) {
    const rule    = this.cssOverrideManager.add({ name, css });
    const page    = this._requirePage(targetId);
    const elemId  = styleElementId(rule.id);
    const ruleCss = css;
    await page.evaluate(({ elemId, ruleCss }) => {
      const el = document.createElement('style');
      el.id = elemId;
      el.textContent = ruleCss;
      document.head.appendChild(el);
    }, { elemId, ruleCss });
    return { ok: true, targetId, rule };
  }

  async cssRemove({ targetId, id } = {}) {
    const removed = this.cssOverrideManager.remove(id);
    if (removed) {
      const page   = this._requirePage(targetId);
      const elemId = styleElementId(id);
      await page.evaluate((elemId) => {
        const el = document.getElementById(elemId);
        if (el) el.remove();
      }, elemId);
    }
    return { ok: true, targetId, id, removed };
  }

  async cssList({ targetId } = {}) {
    const rules = this.cssOverrideManager.list();
    return { ok: true, targetId, rules, count: rules.length };
  }

  async cssClear({ targetId } = {}) {
    const rules = this.cssOverrideManager.allRules();
    const page  = this._requirePage(targetId);
    const ids   = rules.map((r) => r.id);
    await page.evaluate((ids) => {
      for (const id of ids) {
        const el = document.getElementById(`css-override-${id}`);
        if (el) el.remove();
      }
    }, ids);
    this.cssOverrideManager.clear();
    return { ok: true, targetId, cleared: true };
  }

  async cssInject({ targetId } = {}) {
    const rules = this.cssOverrideManager.allRules();
    const page  = this._requirePage(targetId);
    for (const rule of rules) {
      const elemId  = styleElementId(rule.id);
      const ruleCss = rule.css;
      await page.evaluate(({ elemId, ruleCss }) => {
        if (document.getElementById(elemId)) return;
        const el = document.createElement('style');
        el.id = elemId;
        el.textContent = ruleCss;
        document.head.appendChild(el);
      }, { elemId, ruleCss });
    }
    return { ok: true, targetId, injected: rules.length };
  }

  // ── Locale Emulation (Phase 34) ──────────────────────────────────────────────

  async localeList() {
    const locales = [...this.localeEmulator.list().entries()].map(([name, spec]) => ({ name, ...spec }));
    return { ok: true, presets: this.localeEmulator.presets(), locales, count: locales.length };
  }

  async localeAdd({ name, locale, timezone, currency, direction } = {}) {
    const spec = this.localeEmulator.add(name, { locale, timezone, currency, direction });
    return { ok: true, name: String(name).trim(), spec };
  }

  async localeRemove({ name } = {}) {
    const removed = this.localeEmulator.remove(name);
    return { ok: true, name, removed };
  }

  async localeEmulate({ targetId, name, locale, timezone, currency, direction } = {}) {
    const page = this.#pageFor(targetId);
    const spec  = name != null
      ? this.localeEmulator.resolve(name)
      : this.localeEmulator.validateSpec({ locale, timezone, currency, direction });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setLocaleOverride',   { locale:     spec.locale   });
    await cdp.send('Emulation.setTimezoneOverride', { timezoneId: spec.timezone });
    return { ok: true, targetId, locale: spec };
  }

  async localeReset({ targetId } = {}) {
    const page = this.#pageFor(targetId);
    const cdp  = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setLocaleOverride',   { locale:     '' });
    await cdp.send('Emulation.setTimezoneOverride', { timezoneId: '' });
    return { ok: true, targetId, reset: true };
  }

  // ── Error Filter (Phase 33) ───────────────────────────────────────────────────

  async errorFilter({ targetId, message, stack, since, before, deduplicate } = {}) {
    const page  = this.#pageFor(targetId);
    const store = this.logs.get(this.#pageId(page));
    let entries = [...(store?.errors || [])];
    if (message     != null) entries = filterByMessage(entries, message);
    if (stack       != null) entries = filterByStack(entries, stack);
    if (since       != null) entries = errorSince(entries, since);
    if (before      != null) entries = errorBefore(entries, before);
    if (deduplicate)         entries = deduplicateByMessage(entries);
    return { ok: true, targetId, entries, count: entries.length };
  }

  async errorSummary({ targetId } = {}) {
    const page    = this.#pageFor(targetId);
    const store   = this.logs.get(this.#pageId(page));
    const entries = store?.errors || [];
    return { ok: true, targetId, summary: errorSummarize(entries) };
  }

  // ── Page Metrics (Phase 32) ───────────────────────────────────────────────────

  async pageMetrics({ targetId } = {}) {
    const page = this.#pageFor(targetId);
    const raw  = await page.evaluate(() => {
      const nav   = performance.getEntriesByType('navigation')[0] || {};
      const paint = performance.getEntriesByType('paint') || [];
      return {
        navigation: {
          fetchStart:               nav.fetchStart               ?? 0,
          domainLookupStart:        nav.domainLookupStart        ?? 0,
          domainLookupEnd:          nav.domainLookupEnd          ?? 0,
          connectStart:             nav.connectStart             ?? 0,
          connectEnd:               nav.connectEnd               ?? 0,
          requestStart:             nav.requestStart             ?? 0,
          responseStart:            nav.responseStart            ?? 0,
          responseEnd:              nav.responseEnd              ?? 0,
          domContentLoadedEventEnd: nav.domContentLoadedEventEnd ?? 0,
          loadEventEnd:             nav.loadEventEnd             ?? 0,
          redirectCount:            nav.redirectCount            ?? 0,
          type:                     nav.type                     ?? 'navigate',
        },
        paint: paint.map((e) => ({ name: e.name, startTime: e.startTime })),
      };
    });
    const navMetrics   = parseNavigationTiming(raw.navigation);
    const paintMetrics = parsePaintTiming(raw.paint);
    const metrics      = mergeMetrics(navMetrics, paintMetrics);
    return { ok: true, targetId, metrics };
  }

  // ── IndexedDB Manager (Phase 48) ──────────────────────────────────────────────

  async idbDatabases({ targetId } = {}) {
    const page = await this.#pageForTarget(targetId);
    const databases = await page.evaluate(() => indexedDB.databases());
    return { ok: true, targetId, databases, count: databases.length };
  }

  async idbStores({ targetId, database, store: storePattern } = {}) {
    if (database == null) throw new Error('database is required');
    const page = await this.#pageForTarget(targetId);
    let stores = await page.evaluate((dbName) => {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onerror = () => reject(new Error(req.error?.message || 'open failed'));
        req.onsuccess = () => {
          const db = req.result;
          const names = [...db.objectStoreNames];
          db.close();
          resolve(names);
        };
      });
    }, database);
    if (storePattern != null) stores = idbFilterByStore(stores, storePattern);
    return { ok: true, targetId, database, stores, count: stores.length };
  }

  async idbGetAll({ targetId, database, store, key } = {}) {
    if (database == null) throw new Error('database is required');
    if (store == null) throw new Error('store is required');
    const page = await this.#pageForTarget(targetId);
    let entries = await page.evaluate(([dbName, storeName]) => {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onerror = () => reject(new Error(req.error?.message || 'open failed'));
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(storeName)) { db.close(); return resolve([]); }
          const tx = db.transaction(storeName, 'readonly');
          const st = tx.objectStore(storeName);
          const results = [];
          const curReq = st.openCursor();
          curReq.onerror = () => reject(new Error(curReq.error?.message || 'cursor failed'));
          curReq.onsuccess = (ev) => {
            const cursor = ev.target.result;
            if (cursor) { results.push({ key: cursor.key, value: cursor.value }); cursor.continue(); }
            else { db.close(); resolve(results); }
          };
        };
      });
    }, [database, store]);
    if (key != null) entries = idbFilterByKey(entries, key);
    return { ok: true, targetId, database, store, entries, count: entries.length };
  }

  async idbGet({ targetId, database, store, key } = {}) {
    if (database == null) throw new Error('database is required');
    if (store == null) throw new Error('store is required');
    if (key == null) throw new Error('key is required');
    const page = await this.#pageForTarget(targetId);
    const value = await page.evaluate(([dbName, storeName, entryKey]) => {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onerror = () => reject(new Error(req.error?.message || 'open failed'));
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(storeName, 'readonly');
          const st = tx.objectStore(storeName);
          const getReq = st.get(entryKey);
          getReq.onerror = () => reject(new Error(getReq.error?.message || 'get failed'));
          getReq.onsuccess = () => { db.close(); resolve(getReq.result ?? null); };
        };
      });
    }, [database, store, key]);
    return { ok: true, targetId, database, store, key, value };
  }

  async idbSet({ targetId, database, store, key, value } = {}) {
    if (database == null) throw new Error('database is required');
    if (store == null) throw new Error('store is required');
    const page = await this.#pageForTarget(targetId);
    const resultKey = await page.evaluate(([dbName, storeName, entryKey, entryValue]) => {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onerror = () => reject(new Error(req.error?.message || 'open failed'));
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(storeName, 'readwrite');
          const st = tx.objectStore(storeName);
          const putReq = st.keyPath == null ? st.put(entryValue, entryKey) : st.put(entryValue);
          putReq.onerror = () => reject(new Error(putReq.error?.message || 'put failed'));
          putReq.onsuccess = () => { db.close(); resolve(putReq.result); };
        };
      });
    }, [database, store, key, value]);
    return { ok: true, targetId, database, store, key: resultKey };
  }

  async idbDelete({ targetId, database, store, key } = {}) {
    if (database == null) throw new Error('database is required');
    if (store == null) throw new Error('store is required');
    if (key == null) throw new Error('key is required');
    const page = await this.#pageForTarget(targetId);
    await page.evaluate(([dbName, storeName, entryKey]) => {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onerror = () => reject(new Error(req.error?.message || 'open failed'));
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(storeName, 'readwrite');
          const st = tx.objectStore(storeName);
          const delReq = st.delete(entryKey);
          delReq.onerror = () => reject(new Error(delReq.error?.message || 'delete failed'));
          delReq.onsuccess = () => { db.close(); resolve(true); };
        };
      });
    }, [database, store, key]);
    return { ok: true, targetId, database, store, key, deleted: true };
  }

  async idbClear({ targetId, database, store } = {}) {
    if (database == null) throw new Error('database is required');
    if (store == null) throw new Error('store is required');
    const page = await this.#pageForTarget(targetId);
    await page.evaluate(([dbName, storeName]) => {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onerror = () => reject(new Error(req.error?.message || 'open failed'));
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(storeName, 'readwrite');
          const st = tx.objectStore(storeName);
          const clearReq = st.clear();
          clearReq.onerror = () => reject(new Error(clearReq.error?.message || 'clear failed'));
          clearReq.onsuccess = () => { db.close(); resolve(true); };
        };
      });
    }, [database, store]);
    return { ok: true, targetId, database, store, cleared: true };
  }

  async idbExport({ targetId, database } = {}) {
    if (database == null) throw new Error('database is required');
    const page = await this.#pageForTarget(targetId);
    const data = await page.evaluate((dbName) => {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onerror = () => reject(new Error(req.error?.message || 'open failed'));
        req.onsuccess = () => {
          const db = req.result;
          const storeNames = [...db.objectStoreNames];
          if (storeNames.length === 0) { db.close(); return resolve({}); }
          const result = {};
          let idx = 0;
          function nextStore() {
            if (idx >= storeNames.length) { db.close(); return resolve(result); }
            const sName = storeNames[idx++];
            result[sName] = [];
            const tx = db.transaction(sName, 'readonly');
            const st = tx.objectStore(sName);
            const entries = result[sName];
            const curReq = st.openCursor();
            curReq.onerror = () => reject(new Error(curReq.error?.message || 'cursor failed'));
            curReq.onsuccess = (ev) => {
              const cursor = ev.target.result;
              if (cursor) { entries.push({ key: cursor.key, value: cursor.value }); cursor.continue(); }
              else nextStore();
            };
          }
          nextStore();
        };
      });
    }, database);
    return { ok: true, targetId, database, data };
  }

  async idbImport({ targetId, database, data } = {}) {
    if (database == null) throw new Error('database is required');
    if (data == null || typeof data !== 'object') throw new Error('data must be a non-null object');
    const page = await this.#pageForTarget(targetId);
    const imported = await page.evaluate(([dbName, importData]) => {
      return new Promise((resolve, reject) => {
        const storeNames = Object.keys(importData);
        const req = indexedDB.open(dbName);
        req.onerror = () => reject(new Error(req.error?.message || 'open failed'));
        req.onsuccess = () => {
          const db = req.result;
          if (storeNames.length === 0) { db.close(); return resolve(0); }
          let totalCount = 0;
          let idx = 0;
          function nextStore() {
            if (idx >= storeNames.length) { db.close(); return resolve(totalCount); }
            const sName = storeNames[idx++];
            const entries = importData[sName] || [];
            const tx = db.transaction(sName, 'readwrite');
            const st = tx.objectStore(sName);
            tx.oncomplete = () => { totalCount += entries.length; nextStore(); };
            tx.onerror = () => reject(new Error(tx.error?.message || 'transaction failed'));
            for (const { key, value } of entries) {
              if (st.keyPath == null) st.put(value, key);
              else st.put(value);
            }
          }
          nextStore();
        };
      });
    }, [database, data]);
    return { ok: true, targetId, database, imported };
  }

  async idbSummary({ targetId, database, store } = {}) {
    const { entries } = await this.idbGetAll({ targetId, database, store });
    return { ok: true, targetId, database, store, summary: idbSummarize(entries) };
  }

  // ── Clipboard Manager (Phase 49) ──────────────────────────────────────────────

  async clipboardWrite({ targetId, text } = {}) {
    if (text == null) throw new Error('text is required');
    const page = await this.#pageForTarget(targetId);
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.evaluate((t) => navigator.clipboard.writeText(t), String(text));
    const entry = { op: 'write', text: String(text), at: new Date().toISOString() };
    this.clipboardHistory.push(entry);
    return { ok: true, targetId, ...entry };
  }

  async clipboardRead({ targetId } = {}) {
    const page = await this.#pageForTarget(targetId);
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    const text = await page.evaluate(() => navigator.clipboard.readText());
    const entry = { op: 'read', text, at: new Date().toISOString() };
    this.clipboardHistory.push(entry);
    return { ok: true, targetId, text };
  }

  async clipboardClear({ targetId } = {}) {
    const page = await this.#pageForTarget(targetId);
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.evaluate(() => navigator.clipboard.writeText(''));
    const entry = { op: 'write', text: '', at: new Date().toISOString() };
    this.clipboardHistory.push(entry);
    return { ok: true, targetId, cleared: true };
  }

  async clipboardGetHistory({ op, text, since } = {}) {
    let history = [...this.clipboardHistory];
    if (op    != null) history = cbFilterByOp(history, op);
    if (text  != null) history = cbFilterByText(history, text);
    if (since != null) history = cbFilterSince(history, since);
    return { ok: true, history, count: history.length };
  }

  async clipboardClearHistory() {
    this.clipboardHistory = [];
    return { ok: true, cleared: true };
  }

  async clipboardSummary() {
    return { ok: true, summary: cbSummarize(this.clipboardHistory) };
  }

  // ── Form Manager (Phase 50) ────────────────────────────────────────────────────

  async formList({ targetId } = {}) {
    const page = await this.#pageForTarget(targetId);
    const forms = await page.evaluate(() => {
      function collectFields(form) {
        return [...form.elements].map((el) => ({
          tag:      el.tagName.toLowerCase(),
          type:     el.type   || null,
          name:     el.name   || null,
          id:       el.id     || null,
          value:    el.value,
          checked:  (el.type === 'checkbox' || el.type === 'radio') ? el.checked : undefined,
          disabled: el.disabled,
          required: el.required,
          options:  el.tagName === 'SELECT'
            ? [...el.options].map((o) => ({ value: o.value, text: o.text, selected: o.selected }))
            : undefined,
        }));
      }
      return [...document.forms].map((form, index) => ({
        index,
        id:     form.id     || null,
        name:   form.name   || null,
        action: form.action || null,
        method: form.method || 'get',
        fields: collectFields(form),
      }));
    });
    return { ok: true, targetId, forms, count: forms.length };
  }

  async formGet({ targetId, form: formSel = 0 } = {}) {
    const page  = await this.#pageForTarget(targetId);
    const result = await page.evaluate((sel) => {
      function collectFields(form) {
        return [...form.elements].map((el) => ({
          tag:      el.tagName.toLowerCase(),
          type:     el.type   || null,
          name:     el.name   || null,
          id:       el.id     || null,
          value:    el.value,
          checked:  (el.type === 'checkbox' || el.type === 'radio') ? el.checked : undefined,
          disabled: el.disabled,
          required: el.required,
          options:  el.tagName === 'SELECT'
            ? [...el.options].map((o) => ({ value: o.value, text: o.text, selected: o.selected }))
            : undefined,
        }));
      }
      const form = typeof sel === 'number'
        ? document.forms[sel]
        : document.forms[sel] || document.querySelector('form#' + sel) || document.querySelector('form[name="' + sel + '"]');
      if (!form) return null;
      return {
        index:  [...document.forms].indexOf(form),
        id:     form.id     || null,
        name:   form.name   || null,
        action: form.action || null,
        method: form.method || 'get',
        fields: collectFields(form),
      };
    }, formSel);
    if (!result) throw new Error(`Form not found: ${formSel}`);
    return { ok: true, targetId, form: result };
  }

  async formFill({ targetId, form: formSel = 0, fields = {} } = {}) {
    const page = await this.#pageForTarget(targetId);
    const filled = await page.evaluate(([sel, fieldMap]) => {
      const form = typeof sel === 'number'
        ? document.forms[sel]
        : document.forms[sel] || document.querySelector('form#' + sel) || document.querySelector('form[name="' + sel + '"]');
      if (!form) return { ok: false, error: 'form not found' };
      const result = [];
      for (const [fieldName, value] of Object.entries(fieldMap)) {
        const el = form.elements[fieldName];
        if (!el) { result.push({ name: fieldName, ok: false, error: 'field not found' }); continue; }
        if (el.type === 'checkbox' || el.type === 'radio') {
          el.checked = Boolean(value);
        } else {
          el.value = String(value);
        }
        el.dispatchEvent(new Event('input',  { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        result.push({ name: fieldName, ok: true });
      }
      return { ok: true, result };
    }, [formSel, fields]);
    if (!filled.ok) throw new Error(filled.error || 'formFill failed');
    return { ok: true, targetId, result: filled.result };
  }

  async formValues({ targetId, form: formSel = 0 } = {}) {
    const page   = await this.#pageForTarget(targetId);
    const values = await page.evaluate((sel) => {
      const form = typeof sel === 'number'
        ? document.forms[sel]
        : document.forms[sel] || document.querySelector('form#' + sel) || document.querySelector('form[name="' + sel + '"]');
      if (!form) return null;
      const result = {};
      for (const el of form.elements) {
        if (!el.name) continue;
        if (el.type === 'checkbox' || el.type === 'radio') result[el.name] = el.checked;
        else result[el.name] = el.value;
      }
      return result;
    }, formSel);
    if (!values) throw new Error(`Form not found: ${formSel}`);
    return { ok: true, targetId, values };
  }

  async formSubmit({ targetId, form: formSel = 0 } = {}) {
    const page = await this.#pageForTarget(targetId);
    const ok   = await page.evaluate((sel) => {
      const form = typeof sel === 'number'
        ? document.forms[sel]
        : document.forms[sel] || document.querySelector('form#' + sel) || document.querySelector('form[name="' + sel + '"]');
      if (!form) return false;
      form.submit();
      return true;
    }, formSel);
    if (!ok) throw new Error(`Form not found: ${formSel}`);
    return { ok: true, targetId };
  }

  async formReset({ targetId, form: formSel = 0 } = {}) {
    const page = await this.#pageForTarget(targetId);
    const ok   = await page.evaluate((sel) => {
      const form = typeof sel === 'number'
        ? document.forms[sel]
        : document.forms[sel] || document.querySelector('form#' + sel) || document.querySelector('form[name="' + sel + '"]');
      if (!form) return false;
      form.reset();
      return true;
    }, formSel);
    if (!ok) throw new Error(`Form not found: ${formSel}`);
    return { ok: true, targetId, reset: true };
  }

  async formFilter({ targetId, form: formSel = 0, type, name, required, disabled } = {}) {
    const { form } = await this.formGet({ targetId, form: formSel });
    let fields = form.fields;
    if (type     != null) fields = fmFilterByType(fields, type);
    if (name     != null) fields = fmFilterByName(fields, name);
    if (required)         fields = fmFilterRequired(fields);
    if (disabled)         fields = fmFilterDisabled(fields);
    return { ok: true, targetId, fields, count: fields.length };
  }

  async formSummary({ targetId, form: formSel = 0 } = {}) {
    const { form } = await this.formGet({ targetId, form: formSel });
    return { ok: true, targetId, summary: fmSummarize(form.fields) };
  }
}
