import path from 'node:path';
import { normalizeSsrfPolicy } from './security/ssrf.js';

function bool(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function list(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function loadConfig(env = process.env) {
  const baseDir = process.cwd();
  const stateDir = path.resolve(env.BROWSER_STATE_DIR || path.join(baseDir, 'state'));
  const artifactDir = path.resolve(env.BROWSER_ARTIFACT_DIR || path.join(baseDir, 'artifacts'));
  const profilesRootDir = path.resolve(env.BROWSER_PROFILES_ROOT_DIR || path.join(baseDir, 'profiles'));
  const defaultProfile = env.BROWSER_DEFAULT_PROFILE || 'openclaw';

  const dbEnabled = bool(env.DB_ENABLED, false);

  return {
    db: dbEnabled ? {
      host:     env.DB_HOST     || 'postgres',
      port:     number(env.DB_PORT, 5432),
      database: env.DB_NAME     || 'scraper',
      user:     env.DB_USER     || 'scraper',
      password: env.DB_PASSWORD || ''
    } : null,
    server: {
      port: number(env.PORT, 8080),
      host: env.HOST || '0.0.0.0'
    },
    browser: {
      stateDir,
      artifactDir,
      profilesRootDir,
      defaultProfile,
      remoteCdpTimeoutMs: number(env.BROWSER_REMOTE_CDP_TIMEOUT_MS, 1500),
      remoteCdpHandshakeTimeoutMs: number(env.BROWSER_REMOTE_CDP_HANDSHAKE_TIMEOUT_MS, 3000),
      defaultViewport: {
        width: number(env.BROWSER_VIEWPORT_WIDTH, 1440),
        height: number(env.BROWSER_VIEWPORT_HEIGHT, 900)
      },
      ssrfPolicy: normalizeSsrfPolicy({
        dangerouslyAllowPrivateNetwork: bool(env.BROWSER_SSRF_DANGEROUSLY_ALLOW_PRIVATE_NETWORK, false),
        allowedHostnames: list(env.BROWSER_SSRF_ALLOWED_HOSTNAMES),
        hostnameAllowlist: list(env.BROWSER_SSRF_HOSTNAME_ALLOWLIST)
      }),
      profiles: {
        openclaw: {
          driver: 'managed',
          headless: bool(env.BROWSER_HEADLESS, true),
          executablePath: env.BROWSER_EXECUTABLE_PATH || undefined,
          channel: env.BROWSER_CHANNEL || undefined,
          profileDir: path.resolve(env.BROWSER_PROFILE_DIR || path.join(profilesRootDir, 'openclaw')),
          color: '#FF4500',
          stealth: bool(env.BROWSER_STEALTH, true),
          userAgent: env.BROWSER_USER_AGENT || undefined,
          proxy: env.BROWSER_PROXY_SERVER ? {
            server: env.BROWSER_PROXY_SERVER,
            username: env.BROWSER_PROXY_USERNAME || undefined,
            password: env.BROWSER_PROXY_PASSWORD || undefined
          } : undefined
        },
        remote: env.BROWSER_CDP_URL ? {
          driver: 'remote-cdp',
          cdpUrl: env.BROWSER_CDP_URL,
          color: '#00AA00'
        } : undefined
      }
    }
  };
}
