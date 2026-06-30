import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  filterByScope,
  filterByState,
  findByScope,
  summarize,
} from '../src/browser/ServiceWorkerManager.js';

const regs = [
  { scope: 'https://example.com/',      active: { scriptURL: 'https://example.com/sw.js',  state: 'activated' }, waiting: null, installing: null },
  { scope: 'https://example.com/app/',  active: { scriptURL: 'https://example.com/app/sw.js', state: 'activated' }, waiting: { scriptURL: 'https://example.com/app/sw2.js', state: 'installed' }, installing: null },
  { scope: 'https://other.com/',        active: null, waiting: null, installing: { scriptURL: 'https://other.com/sw.js', state: 'installing' } },
  { scope: 'https://example.com/beta/', active: { scriptURL: 'https://example.com/beta/sw.js', state: 'redundant' }, waiting: null, installing: null },
];

// ── filterByScope ─────────────────────────────────────────────────────────────

test('filterByScope: substring match', () => {
  const result = filterByScope(regs, 'example.com');
  assert.equal(result.length, 3);
});

test('filterByScope: RegExp match', () => {
  const result = filterByScope(regs, /\/app\//);
  assert.equal(result.length, 1);
  assert.ok(result[0].scope.includes('/app/'));
});

test('filterByScope: exact scope match', () => {
  const result = filterByScope(regs, 'https://other.com/');
  assert.equal(result.length, 1);
});

test('filterByScope: no match returns empty array', () => {
  assert.deepEqual(filterByScope(regs, 'zzz.invalid'), []);
});

// ── filterByState ─────────────────────────────────────────────────────────────

test('filterByState: activated', () => {
  const result = filterByState(regs, 'activated');
  assert.equal(result.length, 2);
  assert.ok(result.every((r) => r.active?.state === 'activated'));
});

test('filterByState: redundant', () => {
  const result = filterByState(regs, 'redundant');
  assert.equal(result.length, 1);
});

test('filterByState: no active worker returns empty', () => {
  assert.deepEqual(filterByState(regs, 'installing'), []);
});

// ── findByScope ───────────────────────────────────────────────────────────────

test('findByScope: exact match', () => {
  const r = findByScope(regs, 'https://other.com/');
  assert.ok(r);
  assert.equal(r.scope, 'https://other.com/');
});

test('findByScope: substring match', () => {
  const r = findByScope(regs, '/app/');
  assert.ok(r);
  assert.ok(r.scope.includes('/app/'));
});

test('findByScope: no match returns null', () => {
  assert.equal(findByScope(regs, 'not-there'), null);
});

// ── summarize ─────────────────────────────────────────────────────────────────

test('summarize: empty registrations', () => {
  const s = summarize([]);
  assert.equal(s.total, 0);
  assert.equal(s.active, 0);
  assert.equal(s.waiting, 0);
  assert.equal(s.installing, 0);
  assert.equal(s.redundant, 0);
});

test('summarize: total equals registration count', () => {
  assert.equal(summarize(regs).total, 4);
});

test('summarize: active count (non-null active field)', () => {
  assert.equal(summarize(regs).active, 3);
});

test('summarize: waiting count', () => {
  assert.equal(summarize(regs).waiting, 1);
});

test('summarize: installing count', () => {
  assert.equal(summarize(regs).installing, 1);
});

test('summarize: redundant count', () => {
  assert.equal(summarize(regs).redundant, 1);
});

// ── source checks ─────────────────────────────────────────────────────────────

test('BrowserService imports ServiceWorkerManager', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('ServiceWorkerManager'), 'ServiceWorkerManager import missing');
});

test('BrowserService includes swList method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('async swList'), 'swList missing');
});

test('BrowserService includes swUnregister method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('async swUnregister('), 'swUnregister missing');
});

test('BrowserService includes swUnregisterAll method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('async swUnregisterAll'), 'swUnregisterAll missing');
});

test('BrowserService includes swUpdate method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('async swUpdate'), 'swUpdate missing');
});

test('BrowserManager includes sw-list dispatch', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes("case 'sw-list'"), 'sw-list dispatch missing');
});

test('BrowserManager includes swActions in capabilities', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes('swActions'), 'swActions missing from capabilities');
});
