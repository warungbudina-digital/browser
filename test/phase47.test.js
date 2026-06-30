import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  filterByKey,
  filterByValue,
  search,
  toObject,
  fromObject,
  sortByKey,
  summarize,
} from '../src/browser/SessionStorageManager.js';

// ── filterByKey ───────────────────────────────────────────────────────────────

test('filterByKey: substring match', () => {
  const entries = [{ key: 'auth_token', value: 'abc' }, { key: 'user_id', value: '1' }];
  assert.deepEqual(filterByKey(entries, 'auth'), [{ key: 'auth_token', value: 'abc' }]);
});

test('filterByKey: RegExp match', () => {
  const entries = [{ key: 'auth_token', value: 'abc' }, { key: 'session_id', value: '1' }];
  const result  = filterByKey(entries, /^session/);
  assert.equal(result.length, 1);
  assert.equal(result[0].key, 'session_id');
});

test('filterByKey: no match returns empty array', () => {
  const entries = [{ key: 'foo', value: 'bar' }];
  assert.deepEqual(filterByKey(entries, 'xyz'), []);
});

// ── filterByValue ─────────────────────────────────────────────────────────────

test('filterByValue: substring match', () => {
  const entries = [{ key: 'a', value: 'hello world' }, { key: 'b', value: 'goodbye' }];
  assert.deepEqual(filterByValue(entries, 'hello'), [{ key: 'a', value: 'hello world' }]);
});

test('filterByValue: RegExp match', () => {
  const entries = [{ key: 'x', value: '123' }, { key: 'y', value: 'abc' }];
  const result  = filterByValue(entries, /^\d+$/);
  assert.equal(result.length, 1);
  assert.equal(result[0].key, 'x');
});

// ── search ────────────────────────────────────────────────────────────────────

test('search: matches on key (case-insensitive)', () => {
  const entries = [{ key: 'SESSION_ID', value: 'xyz' }];
  assert.equal(search(entries, 'session').length, 1);
});

test('search: matches on value (case-insensitive)', () => {
  const entries = [{ key: 'token', value: 'AbCdEf' }];
  assert.equal(search(entries, 'abcdef').length, 1);
});

test('search: no match returns empty array', () => {
  const entries = [{ key: 'foo', value: 'bar' }];
  assert.deepEqual(search(entries, 'zzz'), []);
});

// ── toObject ──────────────────────────────────────────────────────────────────

test('toObject: converts entries to plain object', () => {
  const entries = [{ key: 'a', value: '1' }, { key: 'b', value: '2' }];
  assert.deepEqual(toObject(entries), { a: '1', b: '2' });
});

test('toObject: empty entries returns empty object', () => {
  assert.deepEqual(toObject([]), {});
});

// ── fromObject ────────────────────────────────────────────────────────────────

test('fromObject: converts plain object to entries', () => {
  const result = fromObject({ x: '1', y: '2' });
  assert.deepEqual(result, [{ key: 'x', value: '1' }, { key: 'y', value: '2' }]);
});

test('fromObject: coerces non-string values to strings', () => {
  const result = fromObject({ n: 42 });
  assert.equal(result[0].value, '42');
});

test('fromObject: throws for null', () => {
  assert.throws(() => fromObject(null), /non-null/);
});

test('fromObject: throws for non-object', () => {
  assert.throws(() => fromObject('string'), /non-null/);
});

// ── sortByKey ─────────────────────────────────────────────────────────────────

test('sortByKey: sorts alphabetically', () => {
  const entries = [{ key: 'z', value: '' }, { key: 'a', value: '' }, { key: 'm', value: '' }];
  const sorted  = sortByKey(entries);
  assert.deepEqual(sorted.map((e) => e.key), ['a', 'm', 'z']);
});

test('sortByKey: does not mutate input', () => {
  const entries = [{ key: 'b', value: '' }, { key: 'a', value: '' }];
  sortByKey(entries);
  assert.equal(entries[0].key, 'b');
});

// ── summarize ─────────────────────────────────────────────────────────────────

test('summarize: empty returns zero count and null largest', () => {
  const s = summarize([]);
  assert.equal(s.count, 0);
  assert.equal(s.totalBytes, 0);
  assert.equal(s.largest, null);
});

test('summarize: count matches entries length', () => {
  const entries = [{ key: 'a', value: '1' }, { key: 'bb', value: '22' }];
  assert.equal(summarize(entries).count, 2);
});

test('summarize: totalBytes is sum of key+value lengths', () => {
  const entries = [{ key: 'ab', value: 'cd' }]; // 2+2 = 4
  assert.equal(summarize(entries).totalBytes, 4);
});

test('summarize: largest is entry with most bytes', () => {
  const entries = [{ key: 'x', value: 'short' }, { key: 'key', value: 'much_longer_value' }];
  assert.equal(summarize(entries).largest.key, 'key');
});

// ── source checks ─────────────────────────────────────────────────────────────

test('BrowserService imports SessionStorageManager', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('SessionStorageManager'), 'SessionStorageManager import missing');
});

test('BrowserService includes ssGetAll method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('async ssGetAll'), 'ssGetAll missing');
});

test('BrowserService includes ssSet method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('async ssSet('), 'ssSet missing');
});

test('BrowserService includes ssImport method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('async ssImport'), 'ssImport missing');
});

test('BrowserService includes ssClear method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('async ssClear'), 'ssClear missing');
});

test('BrowserManager includes ss-get-all dispatch', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes("case 'ss-get-all'"), 'ss-get-all dispatch missing');
});

test('BrowserManager includes ssActions in capabilities', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes('ssActions'), 'ssActions missing from capabilities');
});
