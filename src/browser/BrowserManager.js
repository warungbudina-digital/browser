import path from 'node:path';
import { BrowserService } from './BrowserService.js';
import { ProfileStore } from './ProfileStore.js';
import { assertCdpEndpointAllowed } from '../security/ssrf.js';
import { ScriptStore } from './ScriptStore.js';
import { runScript } from './ScriptRunner.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export class BrowserManager {
  constructor(config) {
    this.config = config;
    this.profileStore = new ProfileStore({
      stateDir: config.stateDir,
      seedProfiles: Object.fromEntries(Object.entries(config.profiles).filter(([, value]) => value)),
      defaultProfile: config.defaultProfile
    });
    this.services     = new Map();
    this.scriptStore  = new ScriptStore();
    this.state        = null;
  }

  async init() {
    if (!this.state) this.state = await this.profileStore.load();
    return this.state;
  }

  async capabilities() {
    const state = await this.init();
    return {
      ok: true,
      toolName: 'browser',
      requestEndpoint: '/browser/request',
      profileEndpoint: '/browser/profiles',
      defaultProfile: state.activeProfile,
      actions: ['status', 'start', 'stop', 'tabs', 'open', 'navigate', 'focus', 'close', 'snapshot', 'snapdiff', 'extract', 'screenshot', 'pdf', 'upload', 'download', 'trace', 'console', 'errors', 'requests', 'dialog', 'warmup', 'cookies', 'act'],
      extractKinds:  ['text', 'meta', 'links', 'full'],
      scriptActions:  ['script-save', 'script-list', 'script-get', 'script-delete', 'script-run'],
      sessionActions:   ['session-save', 'session-load', 'session-list', 'session-delete'],
      interceptActions: ['intercept-add', 'intercept-list', 'intercept-remove', 'intercept-clear'],
      harActions:       ['har-get', 'har-clear'],
      eventActions:     ['event-list', 'event-clear', 'event-script'],
      deviceActions:    ['device-list', 'device-emulate', 'device-reset'],
      transformActions: ['transform-add', 'transform-list', 'transform-remove', 'transform-clear'],
      storageActions:   ['storage-save', 'storage-load', 'storage-list', 'storage-delete'],
      cookieFilterOps:  ['by-domain', 'by-name', 'by-path', 'expired', 'group', 'netscape'],
      geoActions:       ['geo-list', 'geo-add', 'geo-remove', 'geo-emulate', 'geo-reset'],
      throttleActions:  ['throttle-list', 'throttle-add', 'throttle-remove', 'throttle-set', 'throttle-reset'],
      permissionActions: ['permission-grant', 'permission-revoke', 'permission-reset', 'permission-list'],
      consoleFilterOps:  ['level', 'pattern', 'since', 'before', 'group', 'summary', 'format'],
      requestFilterOps:  ['method', 'url', 'status', 'statusRange', 'since', 'before', 'group', 'summary', 'format'],
      metricsActions:    ['page-metrics'],
      errorFilterOps:    ['message', 'stack', 'since', 'before', 'group', 'deduplicate', 'summary', 'format'],
      localeActions:     ['locale-list', 'locale-add', 'locale-remove', 'locale-emulate', 'locale-reset'],
      resourceActions:   ['resource-block', 'resource-unblock', 'resource-list', 'resource-clear'],
      headerActions:     ['header-add', 'header-list', 'header-remove', 'header-clear'],
      viewportActions:   ['viewport-list', 'viewport-add', 'viewport-remove', 'viewport-set', 'viewport-reset'],
      mediaActions:      ['media-list', 'media-get', 'media-set', 'media-reset'],
      authActions:       ['auth-add', 'auth-list', 'auth-remove', 'auth-clear'],
      wsActions:         ['ws-filter', 'ws-summary', 'ws-clear'],
      initActions:       ['init-add', 'init-remove', 'init-list', 'init-clear', 'init-run'],
      axActions:         ['ax-snapshot', 'ax-audit'],
      navActions:        ['nav-history', 'nav-summary', 'nav-clear'],
      lsActions:         ['ls-get-all', 'ls-get', 'ls-set', 'ls-set-many', 'ls-remove', 'ls-clear', 'ls-summary', 'ls-export', 'ls-import'],
      scrollActions:     ['scroll-get', 'scroll-to', 'scroll-by', 'scroll-top', 'scroll-bottom', 'scroll-snapshot', 'scroll-history', 'scroll-clear'],
      cssActions:        ['css-add', 'css-remove', 'css-list', 'css-clear', 'css-inject'],
      actKinds: ['click', 'type', 'press', 'hover', 'scrollIntoView', 'drag', 'select', 'fill', 'resize', 'wait', 'evaluate', 'close', 'batch'],
      profileActions: ['list', 'get', 'create', 'update', 'remove', 'select'],
      snapshotRefModes: ['numeric', 'interactive'],
      snapshotOptions: { frames: 'include same-origin iframes (refs: f1e1, f1e2, ...)' },
      ariaStates: ['checked', 'unchecked', 'expanded', 'collapsed', 'disabled', 'required', 'current'],
      ssrfPolicy: this.config.ssrfPolicy
    };
  }

  async listProfiles() {
    const state = await this.init();
    return {
      ok: true,
      activeProfile: state.activeProfile,
      profiles: Object.entries(state.profiles).map(([name, profile]) => ({ name, ...clone(profile) }))
    };
  }

  async getProfile(name) {
    const state = await this.init();
    const profileName = name || state.activeProfile;
    const profile = state.profiles[profileName];
    if (!profile) throw new Error(`Unknown profile: ${profileName}`);
    return { ok: true, activeProfile: state.activeProfile, profile: { name: profileName, ...clone(profile) } };
  }

  async createProfile(input) {
    const state = await this.init();
    const name = String(input.name || '').trim();
    if (!name) throw new Error('Profile name is required');
    if (state.profiles[name]) throw new Error(`Profile already exists: ${name}`);
    const profile = await this.#normalizeProfile(input);
    state.profiles[name] = profile;
    await this.profileStore.save(state);
    return this.getProfile(name);
  }

  async updateProfile(name, patch) {
    const state = await this.init();
    if (!state.profiles[name]) throw new Error(`Unknown profile: ${name}`);
    const merged = { ...state.profiles[name], ...patch, name };
    state.profiles[name] = await this.#normalizeProfile(merged);
    await this.profileStore.save(state);
    await this.stop(name).catch(() => {});
    return this.getProfile(name);
  }

  async removeProfile(name) {
    const state = await this.init();
    if (!state.profiles[name]) throw new Error(`Unknown profile: ${name}`);
    if (name === this.config.defaultProfile) throw new Error('Cannot remove the default profile');
    if (name === state.activeProfile) throw new Error('Cannot remove the active profile');
    await this.stop(name).catch(() => {});
    delete state.profiles[name];
    await this.profileStore.save(state);
    return { ok: true, removed: name };
  }

  async selectProfile(name) {
    const state = await this.init();
    if (!state.profiles[name]) throw new Error(`Unknown profile: ${name}`);
    state.activeProfile = name;
    await this.profileStore.save(state);
    return { ok: true, activeProfile: name };
  }

  async dispatch(action, payload = {}) {
    // Script actions that don't need a browser service
    switch (action) {
      case 'script-save': {
        const entry = this.scriptStore.save(payload.name, { steps: payload.steps, description: payload.description });
        return { ok: true, script: entry };
      }
      case 'script-list':
        return { ok: true, scripts: this.scriptStore.list(), count: this.scriptStore.size() };
      case 'script-get': {
        const script = this.scriptStore.get(payload.name);
        if (!script) throw new Error(`Script not found: ${payload.name}`);
        return { ok: true, script };
      }
      case 'script-delete':
        this.scriptStore.delete(payload.name);
        return { ok: true, deleted: payload.name };
      case 'script-run': {
        const script = this.scriptStore.get(payload.name);
        if (!script) throw new Error(`Script not found: ${payload.name}`);
        const svc   = await this.#serviceFor(payload.profile || payload.profileName);
        const actFn = (request) => svc.act({ targetId: payload.targetId, request });
        const run   = await runScript(actFn, { steps: script.steps, stopOnError: payload.stopOnError ?? true });
        return { ok: run.ok, name: payload.name, ...run };
      }
    }

    const service = await this.#serviceFor(payload.profile || payload.profileName);
    switch (action) {
      case 'status': return service.status();
      case 'start': return service.start();
      case 'stop': return service.stop();
      case 'tabs': return service.tabs();
      case 'open': return service.open(payload.url);
      case 'navigate': return service.navigate(payload.url, payload.targetId);
      case 'focus': return service.focus(payload.targetId);
      case 'close': return service.close(payload.targetId);
      case 'snapshot':  return service.snapshot(payload);
      case 'snapdiff':  return service.snapdiff(payload);
      case 'extract':   return service.extract(payload);
      case 'screenshot': return service.screenshot(payload);
      case 'pdf': return service.pdf(payload);
      case 'upload': return service.upload(payload);
      case 'download': return service.download(payload);
      case 'trace': return service.trace(payload);
      case 'console': return service.console(payload);
      case 'errors': return service.errors(payload);
      case 'requests': return service.requests(payload);
      case 'dialog': return service.dialog(payload);
      case 'warmup': return service.warmup();
      case 'cookies': return service.cookies(payload);
      case 'act':            return service.act({ targetId: payload.targetId, request: payload.request });
      case 'session-save':      return service.sessionSave(payload);
      case 'session-load':      return service.sessionLoad(payload);
      case 'session-list':      return service.sessionList();
      case 'session-delete':    return service.sessionDelete(payload);
      case 'intercept-add':    return service.interceptAdd(payload);
      case 'intercept-list':   return service.interceptList();
      case 'intercept-remove': return service.interceptRemove(payload);
      case 'intercept-clear':  return service.interceptClear();
      case 'har-get':      return service.harGet(payload);
      case 'har-clear':    return service.harClear(payload);
      case 'event-list':    return service.eventList(payload);
      case 'event-clear':   return service.eventClear(payload);
      case 'event-script':  return service.eventScript(payload);
      case 'device-list':      return service.deviceList();
      case 'device-emulate':   return service.deviceEmulate(payload);
      case 'device-reset':     return service.deviceReset(payload);
      case 'transform-add':    return service.transformAdd(payload);
      case 'transform-list':   return service.transformList();
      case 'transform-remove': return service.transformRemove(payload);
      case 'transform-clear':  return service.transformClear();
      case 'storage-save':   return service.storageSave(payload);
      case 'storage-load':   return service.storageLoad(payload);
      case 'storage-list':   return service.storageList(payload);
      case 'storage-delete': return service.storageDelete(payload);
      case 'cookie-filter':  return service.cookieFilter(payload);
      case 'geo-list':    return service.geoList();
      case 'geo-add':     return service.geoAdd(payload);
      case 'geo-remove':  return service.geoRemove(payload);
      case 'geo-emulate': return service.geoEmulate(payload);
      case 'geo-reset':   return service.geoReset(payload);
      case 'throttle-list':   return service.throttleList();
      case 'throttle-add':    return service.throttleAdd(payload);
      case 'throttle-remove': return service.throttleRemove(payload);
      case 'throttle-set':    return service.throttleSet(payload);
      case 'throttle-reset':  return service.throttleReset(payload);
      case 'permission-grant':  return service.permissionGrant(payload);
      case 'permission-revoke': return service.permissionRevoke(payload);
      case 'permission-reset':  return service.permissionReset(payload);
      case 'permission-list':   return service.permissionList(payload);
      case 'console-filter':  return service.consoleFilter(payload);
      case 'console-summary': return service.consoleSummary(payload);
      case 'request-filter':  return service.requestFilter(payload);
      case 'request-summary': return service.requestSummary(payload);
      case 'page-metrics':    return service.pageMetrics(payload);
      case 'error-filter':  return service.errorFilter(payload);
      case 'error-summary': return service.errorSummary(payload);
      case 'locale-list':    return service.localeList();
      case 'locale-add':     return service.localeAdd(payload);
      case 'locale-remove':  return service.localeRemove(payload);
      case 'locale-emulate': return service.localeEmulate(payload);
      case 'locale-reset':     return service.localeReset(payload);
      case 'resource-block':   return service.resourceBlock(payload);
      case 'resource-unblock': return service.resourceUnblock(payload);
      case 'resource-list':    return service.resourceList();
      case 'resource-clear':   return service.resourceClear();
      case 'header-add':    return service.headerAdd(payload);
      case 'header-list':   return service.headerList();
      case 'header-remove': return service.headerRemove(payload);
      case 'header-clear':  return service.headerClear();
      case 'viewport-list':   return service.viewportList();
      case 'viewport-add':    return service.viewportAdd(payload);
      case 'viewport-remove': return service.viewportRemove(payload);
      case 'viewport-set':    return service.viewportSet(payload);
      case 'viewport-reset':  return service.viewportReset(payload);
      case 'media-list':  return service.mediaList();
      case 'media-get':   return service.mediaGet();
      case 'media-set':   return service.mediaSet(payload);
      case 'media-reset': return service.mediaReset(payload);
      case 'auth-add':    return service.authAdd(payload);
      case 'auth-list':   return service.authList();
      case 'auth-remove': return service.authRemove(payload);
      case 'auth-clear':  return service.authClear();
      case 'ws-filter':  return service.wsFilter(payload);
      case 'ws-summary': return service.wsSummary(payload);
      case 'ws-clear':   return service.wsClear(payload);
      case 'init-add':    return service.initAdd(payload);
      case 'init-remove': return service.initRemove(payload);
      case 'init-list':   return service.initList();
      case 'init-clear':  return service.initClear();
      case 'init-run':    return service.initRun(payload);
      case 'ax-snapshot': return service.axSnapshot(payload);
      case 'ax-audit':    return service.axAudit(payload);
      case 'nav-history': return service.navHistory(payload);
      case 'nav-summary': return service.navSummary(payload);
      case 'nav-clear':   return service.navClear(payload);
      case 'ls-get-all':  return service.lsGetAll(payload);
      case 'ls-get':      return service.lsGet(payload);
      case 'ls-set':      return service.lsSet(payload);
      case 'ls-set-many': return service.lsSetMany(payload);
      case 'ls-remove':   return service.lsRemove(payload);
      case 'ls-clear':    return service.lsClear(payload);
      case 'ls-summary':  return service.lsSummary(payload);
      case 'ls-export':   return service.lsExport(payload);
      case 'ls-import':   return service.lsImport(payload);
      case 'scroll-get':      return service.scrollGet(payload);
      case 'scroll-to':       return service.scrollTo(payload);
      case 'scroll-by':       return service.scrollBy(payload);
      case 'scroll-top':      return service.scrollTop(payload);
      case 'scroll-bottom':   return service.scrollBottom(payload);
      case 'scroll-snapshot': return service.scrollSnapshot(payload);
      case 'scroll-history':  return service.scrollHistory(payload);
      case 'scroll-clear':    return service.scrollClear(payload);
      case 'css-add':         return service.cssAdd(payload);
      case 'css-remove':      return service.cssRemove(payload);
      case 'css-list':        return service.cssList(payload);
      case 'css-clear':       return service.cssClear(payload);
      case 'css-inject':      return service.cssInject(payload);
      default:
        throw new Error(`Unsupported action: ${action}`);
    }
  }

  /** Stop semua active browser services — dipanggil saat graceful shutdown. */
  async stopAll() {
    const names = [...this.services.keys()];
    await Promise.allSettled(names.map((n) => this.stop(n)));
    return { ok: true, stopped: names.length };
  }

  async stop(name) {
    const service = this.services.get(name);
    if (!service) return { ok: true, stopped: false, profileName: name };
    const result = await service.stop();
    this.services.delete(name);
    return result;
  }

  async #serviceFor(requestedProfile) {
    const state = await this.init();
    const profileName = requestedProfile || state.activeProfile;
    const profile = state.profiles[profileName];
    if (!profile) throw new Error(`Unknown profile: ${profileName}`);
    if (!this.services.has(profileName)) {
      this.services.set(profileName, new BrowserService({
        profileName,
        profile,
        artifactDir: path.join(this.config.artifactDir, profileName),
        defaultViewport: this.config.defaultViewport,
        ssrfPolicy: this.config.ssrfPolicy
      }));
    }
    return this.services.get(profileName);
  }

  async #normalizeProfile(input) {
    const driver = input.driver || 'managed';
    if (driver === 'managed') {
      const proxy = input.proxy?.server ? {
        server: String(input.proxy.server),
        username: input.proxy.username || undefined,
        password: input.proxy.password || undefined
      } : undefined;
      return {
        driver,
        headless: input.headless !== false,
        executablePath: input.executablePath || undefined,
        channel: input.channel || undefined,
        profileDir: input.profileDir || path.join(this.config.profilesRootDir, input.name),
        color: input.color || '#FF4500',
        stealth: input.stealth !== false,
        userAgent: input.userAgent || undefined,
        proxy
      };
    }
    if (driver === 'remote-cdp') {
      const cdpUrl = String(input.cdpUrl || '').trim();
      if (!cdpUrl) throw new Error('remote-cdp profile requires cdpUrl');
      await assertCdpEndpointAllowed(cdpUrl, this.config.ssrfPolicy);
      return {
        driver,
        cdpUrl,
        color: input.color || '#00AA00',
        stealth: input.stealth !== false
      };
    }
    throw new Error(`Unsupported profile driver: ${driver}`);
  }
}
