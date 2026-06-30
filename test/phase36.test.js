import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HeaderRuleManager } from '../src/browser/HeaderRuleManager.js';

// ── add ───────────────────────────────────────────────────────────────────────

test('add: returns rule with id, pattern, headers, priority', () => {
  const mgr  = new HeaderRuleManager();
  const rule = mgr.add({ pattern: '**', headers: { 'x-token': 'abc' } });
  assert.ok(typeof rule.id    === 'number');
  assert.equal(rule.pattern,           '**');
  assert.equal(rule.headers['x-token'], 'abc');
  assert.equal(rule.priority,           0);
});

test('add: assigns auto-incrementing ids', () => {
  const mgr = new HeaderRuleManager();
  const r1  = mgr.add({ pattern: '**', headers: { 'a': '1' } });
  const r2  = mgr.add({ pattern: '**', headers: { 'b': '2' } });
  assert.ok(r2.id > r1.id);
});

test('add: default priority is 0', () => {
  const rule = new HeaderRuleManager().add({ pattern: '**', headers: { 'x': '1' } });
  assert.equal(rule.priority, 0);
});

test('add: stores custom priority', () => {
  const rule = new HeaderRuleManager().add({ pattern: '**', headers: { 'x': '1' }, priority: 10 });
  assert.equal(rule.priority, 10);
});

test('add: throws for null pattern', () => {
  assert.throws(() => new HeaderRuleManager().add({ pattern: null, headers: { 'x': '1' } }), /pattern/);
});

test('add: throws for null headers', () => {
  assert.throws(() => new HeaderRuleManager().add({ pattern: '**', headers: null }), /headers/);
});

test('add: throws for non-object headers (array)', () => {
  assert.throws(() => new HeaderRuleManager().add({ pattern: '**', headers: [] }), /headers/);
});

test('add: throws for empty headers object', () => {
  assert.throws(() => new HeaderRuleManager().add({ pattern: '**', headers: {} }), /empty/);
});

test('add: throws for blank header key', () => {
  assert.throws(() => new HeaderRuleManager().add({ pattern: '**', headers: { '': 'v' } }), /keys/);
});

test('add: throws for non-string header value', () => {
  assert.throws(() => new HeaderRuleManager().add({ pattern: '**', headers: { 'x': 123 } }), /values/);
});

test('add: returns copy of headers — mutation does not affect stored rule', () => {
  const mgr  = new HeaderRuleManager();
  const rule = mgr.add({ pattern: '**', headers: { 'x': 'original' } });
  rule.headers['x'] = 'mutated';
  assert.equal(mgr.list()[0].headers['x'], 'original');
});

// ── match ─────────────────────────────────────────────────────────────────────

test('match: returns merged headers for matching URL', () => {
  const mgr = new HeaderRuleManager();
  mgr.add({ pattern: 'https://api.example.com/**', headers: { 'x-token': 'abc' } });
  const result = mgr.match('https://api.example.com/users');
  assert.ok(result != null);
  assert.equal(result['x-token'], 'abc');
});

test('match: returns null when no rules match', () => {
  const mgr = new HeaderRuleManager();
  mgr.add({ pattern: 'https://api.example.com/**', headers: { 'x': '1' } });
  assert.equal(mgr.match('https://other.com/page'), null);
});

test('match: glob pattern — * matches within segment', () => {
  const mgr = new HeaderRuleManager();
  mgr.add({ pattern: 'https://api.example.com/v*/users', headers: { 'x': '1' } });
  assert.ok(mgr.match('https://api.example.com/v2/users') != null);
  assert.equal(mgr.match('https://api.example.com/v2/other'), null);
});

test('match: RegExp pattern', () => {
  const mgr = new HeaderRuleManager();
  mgr.add({ pattern: /example\.com/, headers: { 'x-site': 'example' } });
  assert.ok(mgr.match('https://api.example.com/data') != null);
  assert.equal(mgr.match('https://other.com'), null);
});

test('match: higher-priority rule overrides lower for same header', () => {
  const mgr = new HeaderRuleManager();
  mgr.add({ pattern: '**', headers: { 'x-env': 'production' }, priority: 5 });
  mgr.add({ pattern: '**', headers: { 'x-env': 'staging'    }, priority: 1 });
  const result = mgr.match('https://example.com/api');
  assert.equal(result['x-env'], 'production');
});

test('match: multiple matching rules merge all unique headers', () => {
  const mgr = new HeaderRuleManager();
  mgr.add({ pattern: '**',                           headers: { 'x-global': 'yes' },    priority: 1 });
  mgr.add({ pattern: 'https://api.example.com/**',   headers: { 'x-api-key': 'secret' }, priority: 5 });
  const result = mgr.match('https://api.example.com/data');
  assert.equal(result['x-global'],  'yes');
  assert.equal(result['x-api-key'], 'secret');
});

test('match: returns empty object (not null) when rule matches with empty merge', () => {
  const mgr = new HeaderRuleManager();
  mgr.add({ pattern: '**', headers: { 'x': '1' } });
  assert.ok(mgr.match('https://any.com') !== null);
});

// ── list ──────────────────────────────────────────────────────────────────────

test('list: returns all rules', () => {
  const mgr = new HeaderRuleManager();
  mgr.add({ pattern: 'a', headers: { 'x': '1' } });
  mgr.add({ pattern: 'b', headers: { 'y': '2' } });
  assert.equal(mgr.list().length, 2);
});

test('list: returns empty array initially', () => {
  assert.deepEqual(new HeaderRuleManager().list(), []);
});

test('list: returns copies — mutation safe', () => {
  const mgr  = new HeaderRuleManager();
  mgr.add({ pattern: '**', headers: { 'x': 'original' } });
  const rules = mgr.list();
  rules[0].headers['x'] = 'changed';
  assert.equal(mgr.list()[0].headers['x'], 'original');
});

test('list: rules sorted by priority descending', () => {
  const mgr = new HeaderRuleManager();
  mgr.add({ pattern: 'a', headers: { 'x': '1' }, priority: 1  });
  mgr.add({ pattern: 'b', headers: { 'y': '2' }, priority: 10 });
  mgr.add({ pattern: 'c', headers: { 'z': '3' }, priority: 5  });
  const priorities = mgr.list().map((r) => r.priority);
  assert.deepEqual(priorities, [10, 5, 1]);
});

// ── remove ────────────────────────────────────────────────────────────────────

test('remove: removes rule by id and returns true', () => {
  const mgr  = new HeaderRuleManager();
  const rule = mgr.add({ pattern: '**', headers: { 'x': '1' } });
  assert.equal(mgr.remove(rule.id), true);
  assert.equal(mgr.size, 0);
});

test('remove: returns false for non-existent id', () => {
  assert.equal(new HeaderRuleManager().remove(999), false);
});

// ── clear / size ──────────────────────────────────────────────────────────────

test('clear: removes all rules', () => {
  const mgr = new HeaderRuleManager();
  mgr.add({ pattern: 'a', headers: { 'x': '1' } });
  mgr.add({ pattern: 'b', headers: { 'y': '2' } });
  mgr.clear();
  assert.equal(mgr.size, 0);
});

test('size: returns rule count', () => {
  const mgr = new HeaderRuleManager();
  assert.equal(mgr.size, 0);
  mgr.add({ pattern: '**', headers: { 'x': '1' } });
  assert.equal(mgr.size, 1);
  mgr.add({ pattern: '**', headers: { 'y': '2' } });
  assert.equal(mgr.size, 2);
});

// ── source checks ─────────────────────────────────────────────────────────────

test('BrowserService source imports HeaderRuleManager', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('HeaderRuleManager'), 'HeaderRuleManager import missing');
});

test('BrowserService source includes headerRuleManager instance', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('headerRuleManager'), 'headerRuleManager instance missing');
});

test('BrowserService source includes headerAdd method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('headerAdd'), 'headerAdd method missing');
});

test('BrowserService route handler merges extra headers', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('extraHeaders'), 'header injection missing from route handler');
});

test('BrowserManager source includes header-add dispatch', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes("case 'header-add'"), 'header-add dispatch missing');
});

test('BrowserManager source includes headerActions in capabilities', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes('headerActions'), 'headerActions missing from capabilities');
});
