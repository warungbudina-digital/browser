import path from 'node:path';
import { BrowserService } from './BrowserService.js';
import { ProfileStore } from './ProfileStore.js';
import { assertCdpEndpointAllowed } from '../security/ssrf.js';

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
    this.services = new Map();
    this.state = null;
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
      actions: ['status', 'start', 'stop', 'tabs', 'open', 'navigate', 'focus', 'close', 'snapshot', 'screenshot', 'pdf', 'upload', 'download', 'trace', 'console', 'errors', 'requests', 'dialog', 'warmup', 'cookies', 'act'],
      actKinds: ['click', 'type', 'press', 'hover', 'scrollIntoView', 'drag', 'select', 'fill', 'resize', 'wait', 'evaluate', 'close', 'batch'],
      profileActions: ['list', 'get', 'create', 'update', 'remove', 'select'],
      snapshotRefModes: ['numeric', 'interactive'],
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
      case 'snapshot': return service.snapshot(payload);
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
      case 'act': return service.act({ targetId: payload.targetId, request: payload.request });
      default:
        throw new Error(`Unsupported action: ${action}`);
    }
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
