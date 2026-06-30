import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  filterByKey,
  filterByStore,
  sortByKey,
  summarize,
} from '../src/browser/IndexedDBManager.js';

// ── filterByKey ───────────────────────────────────────────────────────────────

test('filterByKey: substring match', () => {
  const entries = [{ key: 'user:1', value: {} }, { key: 'post:42', value: {} }];
  assert.deepEqual(filterByKey(entries, 'user'), [{ key: 'user:1', value: {} }]);
});

test('filterByKey: RegExp match', () => {
  const entries = [{ key: 'user:1', value: {} }, { key: 'session:abc', value: {} }];
  const result  = filterByKey(entries, /^session/);
  assert.equal(result.length, 1);
  assert.equal(result[0].key, 'session:abc');
});

test('filterByKey: no match returns empty array', () => {
  const entries = [{ key: 'foo', value: null }];
  assert.deepEqual(filterByKey(entries, 'xyz'), []);
});

test('filterByKey: numeric key coerced to string', () => {
  const entries = [{ key: 1, value: 'a' }, { key: 2, value: 'b' }];
  assert.equal(filterByKey(entries, '1').length, 1);
});

// ── filterByStore ─────────────────────────────────────────────────────────────

test('filterByStore: substring match', () => {
  const stores = ['users', 'posts', 'settings'];
  assert.deepEqual(filterByStore(stores, 'user'), ['users']);
});

test('filterByStore: RegExp match', () => {
  const stores = ['users', 'posts', 'uploads'];
  assert.deepEqual(filterByStore(stores, /^up/), ['uploads']);
});

test('filterByStore: no match returns empty array', () => {
  assert.deepEqual(filterByStore(['a', 'b'], 'zzz'), []);
});

test('filterByStore: empty store list returns empty array', () => {
  assert.deepEqual(filterByStore([], 'anything'), []);
});

// ── sortByKey ─────────────────────────────────────────────────────────────────

test('sortByKey: sorts alphabetically by key (string)', () => {
  const entries = [{ key: 'z', value: 1 }, { key: 'a', value: 2 }, { key: 'm', value: 3 }];
  const sorted  = sortByKey(entries);
  assert.deepEqual(sorted.map((e) => e.key), ['a', 'm', 'z']);
});

test('sortByKey: does not mutate input', () => {
  const entries = [{ key: 'b', value: 0 }, { key: 'a', value: 0 }];
  sortByKey(entries);
  assert.equal(entries[0].key, 'b');
});

test('sortByKey: numeric keys coerced to string for comparison', () => {
  const entries = [{ key: 10, value: 0 }, { key: 2, value: 0 }, { key: 1, value: 0 }];
  const sorted  = sortByKey(entries);
  // string sort: '1' < '10' < '2'
  assert.equal(String(sorted[0].key), '1');
  assert.equal(String(sorted[1].key), '10');
  assert.equal(String(sorted[2].key), '2');
});

// ── summarize ─────────────────────────────────────────────────────────────────

test('summarize: empty returns zero count and empty types', () => {
  const s = summarize([]);
  assert.equal(s.count, 0);
  assert.deepEqual(s.types, {});
});

test('summarize: counts by value type', () => {
  const entries = [
    { key: 'a', value: 'hello' },
    { key: 'b', value: 42 },
    { key: 'c', value: null },
    { key: 'd', value: { x: 1 } },
    { key: 'e', value: [1, 2] },
  ];
  const s = summarize(entries);
  assert.equal(s.count, 5);
  assert.equal(s.types.string, 1);
  assert.equal(s.types.number, 1);
  assert.equal(s.types.null,   1);
  assert.equal(s.types.object, 1);
  assert.equal(s.types.array,  1);
});

test('summarize: multiple entries of same type', () => {
  const entries = [{ key: 'a', value: 'x' }, { key: 'b', value: 'y' }, { key: 'c', value: 'z' }];
  assert.equal(summarize(entries).types.string, 3);
});

test('summarize: boolean type tracked correctly', () => {
  const entries = [{ key: 'x', value: true }, { key: 'y', value: false }];
  assert.equal(summarize(entries).types.boolean, 2);
});

// ── source checks ─────────────────────────────────────────────────────────────

test('BrowserService imports IndexedDBManager', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('IndexedDBManager'), 'IndexedDBManager import missing');
});

test('BrowserService defines #pageFor private method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('#pageFor('), '#pageFor definition missing');
});

test('BrowserService defines #pageForTarget private method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('async #pageForTarget'), '#pageForTarget definition missing');
});

test('BrowserService includes idbDatabases method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('async idbDatabases'), 'idbDatabases missing');
});

test('BrowserService includes idbGetAll method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('async idbGetAll'), 'idbGetAll missing');
});

test('BrowserService includes idbSet method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('async idbSet('), 'idbSet missing');
});

test('BrowserService includes idbExport method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('async idbExport'), 'idbExport missing');
});

test('BrowserService includes idbImport method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('async idbImport'), 'idbImport missing');
});

test('BrowserManager includes idb-databases dispatch', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes("case 'idb-databases'"), 'idb-databases dispatch missing');
});

test('BrowserManager includes idbActions in capabilities', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes('idbActions'), 'idbActions missing from capabilities');
});
