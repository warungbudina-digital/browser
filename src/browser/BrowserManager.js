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
