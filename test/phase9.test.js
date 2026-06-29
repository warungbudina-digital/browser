import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KeyStore, parseApiKeys } from '../src/security/KeyStore.js';
import { AuditLogger } from '../src/security/AuditLogger.js';
import { KeyRateLimiter } from '../src/security/KeyRateLimiter.js';

// ── KeyStore ─────────────────────────────────────────────────────────────────

test('KeyStore: single API_KEY resolves as "default"', () => {
  const ks = new KeyStore({ key: 'supersecret' });
  assert.equal(ks.isEmpty(), false);
  const entry = ks.lookup('supersecret');
  assert.deepEqual(entry, { name: 'default', key: 'supersecret' });
  assert.equal(ks.lookup('wrong'), null);
});

test('KeyStore: multi-key via keys array', () => {
  const ks = new KeyStore({
    keys: [
      { name: 'admin', key: 'admintoken' },
      { name: 'bot',   key: 'bottoken'   },
    ],
  });
  assert.equal(ks.names().length, 2);
  assert.deepEqual(ks.lookup('admintoken'), { name: 'admin', key: 'admintoken' });
  assert.deepEqual(ks.lookup('bottoken'),   { name: 'bot',   key: 'bottoken'   });
  assert.equal(ks.lookup('unknown'), null);
});

test('KeyStore: empty when no key configured', () => {
  const ks = new KeyStore();
  assert.equal(ks.isEmpty(), true);
});

test('parseApiKeys: parses comma-separated name:key pairs', () => {
  const result = parseApiKeys('admin:secretA,bot:secretB');
  assert.deepEqual(result, [
    { name: 'admin', key: 'secretA' },
    { name: 'bot',   key: 'secretB' },
  ]);
});

test('parseApiKeys: ignores malformed pairs without colon', () => {
  const result = parseApiKeys('admin:secretA,badinput,bot:secretB');
  assert.equal(result.length, 2);
});

// ── AuditLogger ──────────────────────────────────────────────────────────────

test('AuditLogger: logs entries and returns newest-first', () => {
  const log = new AuditLogger({ maxSize: 100 });
  log.log({ keyName: 'admin', method: 'GET',  path: '/health', status: 200, durationMs: 1 });
  log.log({ keyName: 'bot',   method: 'POST', path: '/scraper/jobs', status: 202, durationMs: 50 });

  const { total, items } = log.query({ limit: 10 });
  assert.equal(total, 2);
  assert.equal(items[0].path, '/scraper/jobs'); // newest first
  assert.equal(items[1].path, '/health');
});

test('AuditLogger: filter by keyName', () => {
  const log = new AuditLogger();
  log.log({ keyName: 'admin', method: 'GET',  path: '/a', status: 200, durationMs: 5 });
  log.log({ keyName: 'bot',   method: 'POST', path: '/b', status: 500, durationMs: 10 });
  log.log({ keyName: 'admin', method: 'POST', path: '/c', status: 200, durationMs: 8 });

  const { total } = log.query({ keyName: 'admin' });
  assert.equal(total, 2);
});

test('AuditLogger: filter by status=error', () => {
  const log = new AuditLogger();
  log.log({ keyName: 'k', method: 'GET',  path: '/ok',  status: 200, durationMs: 1 });
  log.log({ keyName: 'k', method: 'POST', path: '/bad', status: 500, durationMs: 2 });

  const { total, items } = log.query({ status: 'error' });
  assert.equal(total, 1);
  assert.equal(items[0].path, '/bad');
});

test('AuditLogger: stats aggregates per key', () => {
  const log = new AuditLogger();
  log.log({ keyName: 'admin', method: 'GET',  path: '/a', status: 200, durationMs: 10 });
  log.log({ keyName: 'admin', method: 'POST', path: '/b', status: 500, durationMs: 20 });

  const stats = log.stats();
  assert.equal(stats.admin.total,         2);
  assert.equal(stats.admin.success,       1);
  assert.equal(stats.admin.error,         1);
  assert.equal(stats.admin.avgDurationMs, 15);
});

test('AuditLogger: evicts old entries when maxSize exceeded', () => {
  const log = new AuditLogger({ maxSize: 3 });
  for (let i = 0; i < 5; i++) {
    log.log({ keyName: 'k', method: 'GET', path: '/p' + i, status: 200, durationMs: 1 });
  }
  assert.equal(log.size(), 3);
  const { items } = log.query({});
  // Only last 3 should remain (newest: /p4, /p3, /p2)
  assert.equal(items[0].path, '/p4');
});

// ── KeyRateLimiter ───────────────────────────────────────────────────────────

test('KeyRateLimiter: allows requests within rpm limit', () => {
  const rl = new KeyRateLimiter({ rpm: 5, rph: 100 });
  for (let i = 0; i < 5; i++) {
    assert.equal(rl.consume('mykey').allowed, true);
  }
});

test('KeyRateLimiter: blocks when rpm exceeded', () => {
  const rl = new KeyRateLimiter({ rpm: 3, rph: 100 });
  rl.consume('k');
  rl.consume('k');
  rl.consume('k');
  const result = rl.consume('k');
  assert.equal(result.allowed, false);
  assert.equal(result.remaining, 0);
  assert.ok(result.resetAt > Date.now());
});

test('KeyRateLimiter: different keys are independent', () => {
  const rl = new KeyRateLimiter({ rpm: 2, rph: 100 });
  rl.consume('a'); rl.consume('a');
  assert.equal(rl.consume('a').allowed, false);
  assert.equal(rl.consume('b').allowed, true);
});

test('KeyRateLimiter: status shows current usage', () => {
  const rl = new KeyRateLimiter({ rpm: 10, rph: 100 });
  rl.consume('alpha');
  rl.consume('alpha');
  const s = rl.status();
  assert.ok(s.alpha);
  assert.equal(s.alpha.minuteUsed, 2);
  assert.equal(s.alpha.rpmLimit, 10);
});
