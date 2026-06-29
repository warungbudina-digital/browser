import dns from 'node:dns/promises';
import net from 'node:net';

const NETWORK_PROTOCOLS = new Set(['http:', 'https:']);
const SAFE_NON_NETWORK_URLS = new Set(['about:blank']);
const PROXY_ENV_KEYS = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy'];

function normalizeHostname(hostname = '') {
  return String(hostname).trim().replace(/^\[|\]$/g, '').toLowerCase();
}

function hasProxyEnvConfigured(env = process.env) {
  return PROXY_ENV_KEYS.some((key) => String(env[key] || '').trim() !== '');
}

function isLoopbackHost(hostname) {
  const normalized = normalizeHostname(hostname);
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

function isPrivateIPv4(ip) {
  const parts = ip.split('.').map((value) => Number(value));
  if (parts.length !== 4 || parts.some((value) => Number.isNaN(value))) return false;
  return parts[0] === 10
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || parts[0] === 127
    || (parts[0] === 169 && parts[1] === 254);
}

function isPrivateIPv6(ip) {
  const normalized = ip.toLowerCase();
  return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:');
}

function isPrivateIpAddress(ip) {
  const family = net.isIP(ip);
  if (family === 4) return isPrivateIPv4(ip);
  if (family === 6) return isPrivateIPv6(ip);
  return false;
}

function matchesHostnameAllowlist(hostname, patterns = []) {
  const normalized = normalizeHostname(hostname);
  return patterns.some((pattern) => {
    const value = normalizeHostname(pattern);
    if (!value) return false;
    if (value.startsWith('*.')) {
      const suffix = value.slice(2);
      return normalized === suffix || normalized.endsWith(`.${suffix}`);
    }
    return normalized === value;
  });
}

function isExplicitlyAllowedBrowserHostname(hostname, ssrfPolicy = {}) {
  const normalized = normalizeHostname(hostname);
  if ((ssrfPolicy.allowedHostnames || []).some((value) => normalizeHostname(value) === normalized)) return true;
  return matchesHostnameAllowlist(normalized, ssrfPolicy.hostnameAllowlist || []);
}

function isPrivateNetworkAllowedByPolicy(ssrfPolicy = {}) {
  return ssrfPolicy.dangerouslyAllowPrivateNetwork === true || ssrfPolicy.allowPrivateNetwork === true;
}

async function resolveHostname(hostname, lookupFn = dns.lookup) {
  const records = await lookupFn(hostname, { all: true });
  return Array.isArray(records) ? records.map((entry) => entry.address) : [records.address];
}

export function normalizeSsrfPolicy(rawPolicy = {}) {
  const allowedHostnames = [...new Set((rawPolicy.allowedHostnames || []).map(normalizeHostname).filter(Boolean))];
  const hostnameAllowlist = [...new Set((rawPolicy.hostnameAllowlist || []).map(normalizeHostname).filter(Boolean))];
  const hasExplicitPrivateSetting = rawPolicy.allowPrivateNetwork !== undefined || rawPolicy.dangerouslyAllowPrivateNetwork !== undefined;
  const dangerouslyAllowPrivateNetwork = rawPolicy.dangerouslyAllowPrivateNetwork === true || rawPolicy.allowPrivateNetwork === true;

  if (!allowedHostnames.length && !hostnameAllowlist.length && !hasExplicitPrivateSetting) {
    return { dangerouslyAllowPrivateNetwork: false, allowedHostnames: [], hostnameAllowlist: [] };
  }

  return {
    dangerouslyAllowPrivateNetwork,
    allowedHostnames,
    hostnameAllowlist
  };
}

export async function assertCdpEndpointAllowed(cdpUrl, ssrfPolicy, options = {}) {
  const parsed = new URL(cdpUrl);
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol)) {
    throw new Error(`Invalid CDP URL protocol: ${parsed.protocol.replace(':', '')}`);
  }
  await assertHostnameAllowed(parsed.hostname, ssrfPolicy, options);
}

export async function assertBrowserNavigationAllowed({ url, ssrfPolicy, lookupFn, env } = {}) {
  if (!url) throw new Error('url is required');

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  if (!NETWORK_PROTOCOLS.has(parsed.protocol)) {
    if (SAFE_NON_NETWORK_URLS.has(parsed.href)) return;
    throw new Error(`Navigation blocked: unsupported protocol "${parsed.protocol}"`);
  }

  if (hasProxyEnvConfigured(env) && !isPrivateNetworkAllowedByPolicy(ssrfPolicy)) {
    throw new Error('Navigation blocked: strict browser SSRF policy cannot be enforced while proxy env vars are set');
  }

  if (ssrfPolicy?.dangerouslyAllowPrivateNetwork === false
    && !isPrivateNetworkAllowedByPolicy(ssrfPolicy)
    && net.isIP(parsed.hostname) === 0
    && !isExplicitlyAllowedBrowserHostname(parsed.hostname, ssrfPolicy)) {
    throw new Error('Navigation blocked: strict browser SSRF policy requires IP-literal URLs or explicit hostname allowlists');
  }

  await assertHostnameAllowed(parsed.hostname, ssrfPolicy, { lookupFn });
}

export async function assertBrowserNavigationResultAllowed({ url, ssrfPolicy, lookupFn, env } = {}) {
  if (!url) return;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }
  if (NETWORK_PROTOCOLS.has(parsed.protocol) || SAFE_NON_NETWORK_URLS.has(parsed.href)) {
    await assertBrowserNavigationAllowed({ url, ssrfPolicy, lookupFn, env });
  }
}

export async function assertHostnameAllowed(hostname, ssrfPolicy = {}, { lookupFn } = {}) {
  const normalized = normalizeHostname(hostname);
  if (!normalized) throw new Error('hostname is required');
  if (isLoopbackHost(normalized)) return;
  if (isExplicitlyAllowedBrowserHostname(normalized, ssrfPolicy)) return;

  const addresses = net.isIP(normalized) ? [normalized] : await resolveHostname(normalized, lookupFn);
  const privateHits = addresses.filter((address) => isPrivateIpAddress(address));
  if (privateHits.length > 0 && !isPrivateNetworkAllowedByPolicy(ssrfPolicy)) {
    throw new Error(`Blocked by SSRF policy: ${hostname} resolved to private IP(s): ${privateHits.join(', ')}`);
  }
}

export function describeSsrfPolicy(ssrfPolicy = {}) {
  return {
    dangerouslyAllowPrivateNetwork: Boolean(ssrfPolicy.dangerouslyAllowPrivateNetwork),
    allowedHostnames: ssrfPolicy.allowedHostnames || [],
    hostnameAllowlist: ssrfPolicy.hostnameAllowlist || []
  };
}
