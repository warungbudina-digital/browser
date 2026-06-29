/**
 * ConfigValidator — validate environment variables before the server starts.
 * Pure function: validateConfig(env) → { valid, errors, warnings }
 *
 * Errors   → config is broken; server should NOT start.
 * Warnings → config might work but is unusual or risky.
 *
 * Only validates values that are explicitly provided (non-empty strings).
 * Missing optional values are fine — config.js supplies defaults.
 */

function isPositiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1;
}

function isValidHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function provided(env, key) {
  return env[key] !== undefined && env[key] !== '';
}

/**
 * @param {Record<string, string|undefined>} env  — typically process.env
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateConfig(env = {}) {
  const errors   = [];
  const warnings = [];

  // ── Port ────────────────────────────────────────────────────────────────────
  if (provided(env, 'PORT')) {
    const n = Number(env.PORT);
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
      errors.push(`PORT must be an integer 1–65535, got: "${env.PORT}"`);
    }
  }

  // ── Rate limit ───────────────────────────────────────────────────────────────
  if (provided(env, 'RATE_LIMIT_RPM') && !isPositiveInt(env.RATE_LIMIT_RPM)) {
    errors.push(`RATE_LIMIT_RPM must be a positive integer, got: "${env.RATE_LIMIT_RPM}"`);
  }
  if (provided(env, 'RATE_LIMIT_RPH') && !isPositiveInt(env.RATE_LIMIT_RPH)) {
    errors.push(`RATE_LIMIT_RPH must be a positive integer, got: "${env.RATE_LIMIT_RPH}"`);
  }

  // ── Browser pool ─────────────────────────────────────────────────────────────
  if (provided(env, 'BROWSER_POOL_SIZE')) {
    const n = Number(env.BROWSER_POOL_SIZE);
    if (!Number.isInteger(n) || n < 1) {
      errors.push(`BROWSER_POOL_SIZE must be an integer >= 1, got: "${env.BROWSER_POOL_SIZE}"`);
    } else if (n > 10) {
      warnings.push(`BROWSER_POOL_SIZE=${n} is unusually high and may exhaust system resources`);
    }
  }

  // ── Audit log ────────────────────────────────────────────────────────────────
  if (provided(env, 'AUDIT_LOG_MAX_SIZE')) {
    const n = Number(env.AUDIT_LOG_MAX_SIZE);
    if (!Number.isInteger(n) || n < 100) {
      errors.push(`AUDIT_LOG_MAX_SIZE must be an integer >= 100, got: "${env.AUDIT_LOG_MAX_SIZE}"`);
    }
  }

  // ── Alert webhook ────────────────────────────────────────────────────────────
  if (provided(env, 'ALERT_WEBHOOK_URL') && !isValidHttpUrl(env.ALERT_WEBHOOK_URL)) {
    errors.push(`ALERT_WEBHOOK_URL must be a valid http/https URL, got: "${env.ALERT_WEBHOOK_URL}"`);
  }

  // ── Viewport ─────────────────────────────────────────────────────────────────
  if (provided(env, 'BROWSER_VIEWPORT_WIDTH')) {
    const n = Number(env.BROWSER_VIEWPORT_WIDTH);
    if (!Number.isInteger(n) || n < 100 || n > 7680) {
      errors.push(`BROWSER_VIEWPORT_WIDTH must be 100–7680, got: "${env.BROWSER_VIEWPORT_WIDTH}"`);
    }
  }
  if (provided(env, 'BROWSER_VIEWPORT_HEIGHT')) {
    const n = Number(env.BROWSER_VIEWPORT_HEIGHT);
    if (!Number.isInteger(n) || n < 100 || n > 4320) {
      errors.push(`BROWSER_VIEWPORT_HEIGHT must be 100–4320, got: "${env.BROWSER_VIEWPORT_HEIGHT}"`);
    }
  }

  // ── Cross-service warnings ────────────────────────────────────────────────────
  if (env.API_KEY && env.API_KEYS) {
    warnings.push('Both API_KEY and API_KEYS are set — API_KEYS takes precedence; remove API_KEY to avoid confusion');
  }

  if (env.DB_ENABLED === 'true' || env.DB_ENABLED === '1') {
    if (!env.DB_PASSWORD) {
      warnings.push('DB_ENABLED=true but DB_PASSWORD is not set — using empty password');
    }
  }

  if ((env.REDIS_ENABLED === 'true' || env.REDIS_ENABLED === '1') &&
      env.DB_ENABLED !== 'true' && env.DB_ENABLED !== '1') {
    warnings.push('REDIS_ENABLED=true but DB_ENABLED is not set — BullMQ jobs will have no DB persistence');
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate and log results. Returns true if valid, false if errors found.
 * @param {Record<string, string|undefined>} env
 * @param {{ log?: (msg: string) => void }} opts
 */
export function validateAndLog(env = {}, { log = console.warn } = {}) {
  const result = validateConfig(env);
  for (const w of result.warnings) log(`[Config] WARN: ${w}`);
  for (const e of result.errors)   log(`[Config] ERROR: ${e}`);
  return result;
}
