import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig } from '../src/ConfigValidator.js';
import { generateRequestId, createCorrelationIdHook } from '../src/middleware/correlationId.js';

// ── validateConfig: valid (empty / all defaults) ──────────────────────────────

test('validateConfig: empty env → valid, no errors or warnings', () => {
  const r = validateConfig({});
  assert.equal(r.valid, true);
  assert.equal(r.errors.length,   0);
  assert.equal(r.warnings.length, 0);
});

test('validateConfig: undefined env → valid', () => {
  const r = validateConfig();
  assert.equal(r.valid, true);
});

test('validateConfig: empty-string values are ignored (not validated)', () => {
  const r = validateConfig({ PORT: '', RATE_LIMIT_RPM: '', BROWSER_POOL_SIZE: '' });
  assert.equal(r.valid, true);
});

// ── PORT ──────────────────────────────────────────────────────────────────────

test('validateConfig: valid PORT → no error', () => {
  assert.equal(validateConfig({ PORT: '8080' }).valid, true);
  assert.equal(validateConfig({ PORT: '1' }).valid,    true);
  assert.equal(validateConfig({ PORT: '65535' }).valid, true);
});

test('validateConfig: PORT=0 → error', () => {
  const r = validateConfig({ PORT: '0' });
  assert.equal(r.valid, false);
  assert.ok(r.errors[0].includes('PORT'), r.errors[0]);
});

test('validateConfig: PORT=65536 → error', () => {
  assert.equal(validateConfig({ PORT: '65536' }).valid, false);
});

test('validateConfig: PORT=abc → error', () => {
  assert.equal(validateConfig({ PORT: 'abc' }).valid, false);
});

// ── RATE_LIMIT_RPM / RPH ──────────────────────────────────────────────────────

test('validateConfig: valid RATE_LIMIT_RPM → no error', () => {
  assert.equal(validateConfig({ RATE_LIMIT_RPM: '60' }).valid, true);
});

test('validateConfig: RATE_LIMIT_RPM=0 → error', () => {
  assert.equal(validateConfig({ RATE_LIMIT_RPM: '0' }).valid, false);
});

test('validateConfig: RATE_LIMIT_RPM=1.5 → error (not integer)', () => {
  assert.equal(validateConfig({ RATE_LIMIT_RPM: '1.5' }).valid, false);
});

test('validateConfig: RATE_LIMIT_RPH=bad → error', () => {
  assert.equal(validateConfig({ RATE_LIMIT_RPH: 'bad' }).valid, false);
});

// ── BROWSER_POOL_SIZE ─────────────────────────────────────────────────────────

test('validateConfig: BROWSER_POOL_SIZE=3 → valid', () => {
  assert.equal(validateConfig({ BROWSER_POOL_SIZE: '3' }).valid, true);
});

test('validateConfig: BROWSER_POOL_SIZE=0 → error', () => {
  assert.equal(validateConfig({ BROWSER_POOL_SIZE: '0' }).valid, false);
});

test('validateConfig: BROWSER_POOL_SIZE=11 → warning (not error)', () => {
  const r = validateConfig({ BROWSER_POOL_SIZE: '11' });
  assert.equal(r.valid, true);
  assert.ok(r.warnings.some((w) => w.includes('11')), `warnings: ${r.warnings}`);
});

// ── AUDIT_LOG_MAX_SIZE ────────────────────────────────────────────────────────

test('validateConfig: AUDIT_LOG_MAX_SIZE=100 → valid', () => {
  assert.equal(validateConfig({ AUDIT_LOG_MAX_SIZE: '100' }).valid, true);
});

test('validateConfig: AUDIT_LOG_MAX_SIZE=99 → error', () => {
  assert.equal(validateConfig({ AUDIT_LOG_MAX_SIZE: '99' }).valid, false);
});

// ── ALERT_WEBHOOK_URL ─────────────────────────────────────────────────────────

test('validateConfig: valid https webhook URL → no error', () => {
  assert.equal(validateConfig({ ALERT_WEBHOOK_URL: 'https://hooks.example.com/notify' }).valid, true);
});

test('validateConfig: invalid webhook URL → error', () => {
  assert.equal(validateConfig({ ALERT_WEBHOOK_URL: 'not-a-url' }).valid, false);
});

test('validateConfig: ftp:// webhook URL → error (not http/https)', () => {
  assert.equal(validateConfig({ ALERT_WEBHOOK_URL: 'ftp://example.com/hook' }).valid, false);
});

// ── BROWSER_VIEWPORT ──────────────────────────────────────────────────────────

test('validateConfig: valid viewport → no error', () => {
  assert.equal(validateConfig({ BROWSER_VIEWPORT_WIDTH: '1440', BROWSER_VIEWPORT_HEIGHT: '900' }).valid, true);
});

test('validateConfig: BROWSER_VIEWPORT_WIDTH=50 → error (below 100)', () => {
  assert.equal(validateConfig({ BROWSER_VIEWPORT_WIDTH: '50' }).valid, false);
});

test('validateConfig: BROWSER_VIEWPORT_HEIGHT=99 → error', () => {
  assert.equal(validateConfig({ BROWSER_VIEWPORT_HEIGHT: '99' }).valid, false);
});

// ── Cross-service warnings ────────────────────────────────────────────────────

test('validateConfig: both API_KEY and API_KEYS → warning', () => {
  const r = validateConfig({ API_KEY: 'abc', API_KEYS: 'name1:secret1' });
  assert.equal(r.valid, true);
  assert.ok(r.warnings.some((w) => w.includes('API_KEY') && w.includes('API_KEYS')), `warnings: ${r.warnings}`);
});

test('validateConfig: DB_ENABLED=true without DB_PASSWORD → warning', () => {
  const r = validateConfig({ DB_ENABLED: 'true' });
  assert.equal(r.valid, true);
  assert.ok(r.warnings.some((w) => w.includes('DB_PASSWORD')), `warnings: ${r.warnings}`);
});

test('validateConfig: REDIS_ENABLED=true without DB_ENABLED → warning', () => {
  const r = validateConfig({ REDIS_ENABLED: 'true' });
  assert.ok(r.warnings.some((w) => w.includes('DB_ENABLED')), `warnings: ${r.warnings}`);
});

test('validateConfig: multiple errors collected (not fail-fast)', () => {
  const r = validateConfig({ PORT: 'bad', RATE_LIMIT_RPM: 'bad', BROWSER_POOL_SIZE: '-1' });
  assert.equal(r.valid, false);
  assert.ok(r.errors.length >= 3, `expected ≥3 errors, got ${r.errors.length}`);
});

// ── generateRequestId ─────────────────────────────────────────────────────────

test('generateRequestId: returns a valid UUID v4 string', () => {
  const id = generateRequestId();
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});

test('generateRequestId: each call returns a unique ID', () => {
  const ids = new Set(Array.from({ length: 20 }, () => generateRequestId()));
  assert.equal(ids.size, 20);
});

// ── createCorrelationIdHook ───────────────────────────────────────────────────

test('correlationIdHook: generates new ID if header absent', () => {
  const hook    = createCorrelationIdHook();
  const headers = {};
  const request = { headers, requestId: null };
  const reply   = { header: (k, v) => { headers[k] = v; } };

  hook(request, reply);

  assert.ok(request.requestId, 'requestId should be set');
  assert.match(request.requestId, /^[0-9a-f-]{36}$/i);
  assert.equal(headers['x-request-id'], request.requestId);
});

test('correlationIdHook: reuses existing x-request-id from incoming header', () => {
  const hook    = createCorrelationIdHook();
  const request = { headers: { 'x-request-id': 'my-trace-id' }, requestId: null };
  const reply   = { header: () => {} };

  hook(request, reply);

  assert.equal(request.requestId, 'my-trace-id');
});

test('correlationIdHook: sets x-request-id response header', () => {
  const hook    = createCorrelationIdHook();
  const replied = {};
  const request = { headers: {}, requestId: null };
  const reply   = { header: (k, v) => { replied[k] = v; } };

  hook(request, reply);

  assert.ok(replied['x-request-id'], 'response header should be set');
});
