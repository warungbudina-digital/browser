import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { InterceptManager, matchesPattern } from '../src/browser/InterceptManager.js';

// ── matchesPattern: string glob ──────────────────────────────────────────────

test('matchesPattern: exact string match', () => {
  assert.equal(matchesPattern('https://example.com/page', 'https://example.com/page'), true);
});

test('matchesPattern: exact string non-match', () => {
  assert.equal(matchesPattern('https://example.com/page', 'https://example.com/other'), false);
});

test('matchesPattern: * matches within segment', () => {
  assert.equal(matchesPattern('https://example.com/*.js', 'https://example.com/app.js'), true);
  assert.equal(matchesPattern('https://example.com/*.js', 'https://example.com/sub/app.js'), false);
});

test('matchesPattern: ** matches across segments', () => {
  assert.equal(matchesPattern('https://example.com/**', 'https://example.com/a/b/c'), true);
  assert.equal(matchesPattern('https://example.com/**', 'https://example.com/'), true);
});

test('matchesPattern: ** prefix wildcard (e.g. block all png)', () => {
  assert.equal(matchesPattern('**/*.png', 'https://ads.example.com/img/banner.png'), true);
  assert.equal(matchesPattern('**/*.png', 'https://ads.example.com/img/banner.jpg'), false);
});

test('matchesPattern: ? matches exactly one character', () => {
  assert.equal(matchesPattern('https://example.com/v?/', 'https://example.com/v1/'), true);
  assert.equal(matchesPattern('https://example.com/v?/', 'https://example.com/v10/'), false);
});

test('matchesPattern: domain wildcard pattern', () => {
  assert.equal(matchesPattern('https://ads.*.com/**', 'https://ads.tracker.com/pixel'), true);
  assert.equal(matchesPattern('https://ads.*.com/**', 'https://safe.example.com/page'), false);
});

// ── matchesPattern: RegExp ───────────────────────────────────────────────────

test('matchesPattern: RegExp match', () => {
  assert.equal(matchesPattern(/\/api\/v\d+\//, 'https://example.com/api/v3/data'), true);
});

test('matchesPattern: RegExp non-match', () => {
  assert.equal(matchesPattern(/\/api\/v\d+\//, 'https://example.com/graphql'), false);
});

test('matchesPattern: non-string non-RegExp pattern returns false', () => {
  assert.equal(matchesPattern(null, 'https://example.com'), false);
  assert.equal(matchesPattern(42, 'https://example.com'), false);
});

// ── InterceptManager: add ────────────────────────────────────────────────────

test('InterceptManager: add returns rule with id, addedAt, hits=0', () => {
  const mgr  = new InterceptManager();
  const rule = mgr.add({ pattern: '**/*.png', action: 'block' });
  assert.ok(rule.id, 'id should be set');
  assert.equal(rule.action, 'block');
  assert.equal(rule.hits, 0);
  assert.ok(rule.addedAt);
});

test('InterceptManager: add without pattern throws', () => {
  assert.throws(() => new InterceptManager().add({ action: 'block' }), /pattern/i);
});

test('InterceptManager: add with invalid pattern type throws', () => {
  assert.throws(() => new InterceptManager().add({ pattern: 123, action: 'block' }), /pattern/i);
});

test('InterceptManager: add with invalid action throws', () => {
  assert.throws(() => new InterceptManager().add({ pattern: '**', action: 'redirect' }), /action/i);
});

test('InterceptManager: add mock without response throws', () => {
  assert.throws(
    () => new InterceptManager().add({ pattern: '**', action: 'mock' }),
    /response/i,
  );
});

test('InterceptManager: add mock with response succeeds', () => {
  const mgr  = new InterceptManager();
  const rule = mgr.add({ pattern: '**', action: 'mock', response: { status: 200, body: '{}' } });
  assert.equal(rule.action, 'mock');
  assert.deepEqual(rule.response, { status: 200, body: '{}' });
});

test('InterceptManager: add passthrough requires no response', () => {
  const mgr  = new InterceptManager();
  const rule = mgr.add({ pattern: '**', action: 'passthrough' });
  assert.equal(rule.action, 'passthrough');
  assert.equal(rule.response, null);
});

// ── InterceptManager: list + size ───────────────────────────────────────────

test('InterceptManager: list empty initially', () => {
  assert.deepEqual(new InterceptManager().list(), []);
});

test('InterceptManager: size reflects current count', () => {
  const mgr = new InterceptManager();
  assert.equal(mgr.size, 0);
  mgr.add({ pattern: '**', action: 'block' });
  assert.equal(mgr.size, 1);
  mgr.add({ pattern: '**/*.js', action: 'passthrough' });
  assert.equal(mgr.size, 2);
});

test('InterceptManager: list returns copies (mutations do not affect store)', () => {
  const mgr  = new InterceptManager();
  const r1   = mgr.add({ pattern: '**', action: 'block' });
  const list = mgr.list();
  list[0].action = 'mock';
  assert.equal(mgr.list()[0].action, 'block');
  void r1;
});

// ── InterceptManager: priority ordering ─────────────────────────────────────

test('InterceptManager: rules sorted by priority desc', () => {
  const mgr = new InterceptManager();
  mgr.add({ pattern: '**/*.png', action: 'block', priority: 1 });
  mgr.add({ pattern: '**',       action: 'passthrough', priority: 0 });
  mgr.add({ pattern: '**/*.js',  action: 'block', priority: 5 });
  const list = mgr.list();
  assert.equal(list[0].priority, 5);
  assert.equal(list[1].priority, 1);
  assert.equal(list[2].priority, 0);
});

// ── InterceptManager: remove ─────────────────────────────────────────────────

test('InterceptManager: remove existing rule returns true', () => {
  const mgr  = new InterceptManager();
  const rule = mgr.add({ pattern: '**', action: 'block' });
  assert.equal(mgr.remove(rule.id), true);
  assert.equal(mgr.size, 0);
});

test('InterceptManager: remove non-existent id returns false', () => {
  assert.equal(new InterceptManager().remove('not-a-real-id'), false);
});

// ── InterceptManager: clear ──────────────────────────────────────────────────

test('InterceptManager: clear removes all rules', () => {
  const mgr = new InterceptManager();
  mgr.add({ pattern: '**', action: 'block' });
  mgr.add({ pattern: '**/*.js', action: 'passthrough' });
  mgr.clear();
  assert.equal(mgr.size, 0);
  assert.deepEqual(mgr.list(), []);
});

// ── InterceptManager: match ──────────────────────────────────────────────────

test('InterceptManager: match returns null when no rules', () => {
  assert.equal(new InterceptManager().match('https://example.com'), null);
});

test('InterceptManager: match returns null when no rule matches', () => {
  const mgr = new InterceptManager();
  mgr.add({ pattern: '**/*.png', action: 'block' });
  assert.equal(mgr.match('https://example.com/app.js'), null);
});

test('InterceptManager: match returns first matching rule', () => {
  const mgr = new InterceptManager();
  mgr.add({ pattern: '**/*.png', action: 'block' });
  const matched = mgr.match('https://cdn.example.com/banner.png');
  assert.ok(matched);
  assert.equal(matched.action, 'block');
});

test('InterceptManager: match increments hit count', () => {
  const mgr  = new InterceptManager();
  const rule = mgr.add({ pattern: '**', action: 'passthrough' });
  mgr.match('https://example.com/a');
  mgr.match('https://example.com/b');
  const current = mgr.list().find((r) => r.id === rule.id);
  assert.equal(current.hits, 2);
});

test('InterceptManager: higher-priority rule wins when two patterns match', () => {
  const mgr = new InterceptManager();
  mgr.add({ pattern: '**',      action: 'passthrough', priority: 0 });
  mgr.add({ pattern: '**/*.png', action: 'block',       priority: 10 });
  const matched = mgr.match('https://example.com/img.png');
  assert.equal(matched.action, 'block');
});

test('InterceptManager: match returns copy (mutation does not affect store)', () => {
  const mgr = new InterceptManager();
  mgr.add({ pattern: '**', action: 'block' });
  const m = mgr.match('https://example.com');
  m.action = 'mock';
  assert.equal(mgr.match('https://example.com').action, 'block');
});

test('InterceptManager: RegExp pattern matched by match()', () => {
  const mgr = new InterceptManager();
  mgr.add({ pattern: /\/api\//, action: 'passthrough' });
  assert.ok(mgr.match('https://example.com/api/data'));
  assert.equal(mgr.match('https://example.com/page'), null);
});

// ── BrowserManager source: intercept dispatch cases present ─────────────────

test('BrowserManager source includes intercept-add dispatch', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes("case 'intercept-add'"),    'intercept-add dispatch missing');
  assert.ok(src.includes("case 'intercept-list'"),   'intercept-list dispatch missing');
  assert.ok(src.includes("case 'intercept-remove'"), 'intercept-remove dispatch missing');
  assert.ok(src.includes("case 'intercept-clear'"),  'intercept-clear dispatch missing');
});

test('BrowserManager source includes interceptActions in capabilities', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes('interceptActions'), 'interceptActions missing from capabilities');
});
