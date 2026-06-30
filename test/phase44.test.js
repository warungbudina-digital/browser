import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  filterByKey, filterByValue, search,
  toObject, fromObject, sortByKey, summarize,
} from '../src/browser/LocalStorageManager.js';

// helper
const entry = (key, value) => ({ key, value });

// ── filterByKey ───────────────────────────────────────────────────────────────

test('filterByKey: string substring match', () => {
  const entries = [entry('auth_token', 'abc'), entry('user_id', '42'), entry('auth_expiry', '999')];
  assert.equal(filterByKey(entries, 'auth').length, 2);
});

test('filterByKey: RegExp match', () => {
  const entries = [entry('foo_bar', 'x'), entry('baz', 'y'), entry('foo_baz', 'z')];
  assert.equal(filterByKey(entries, /^foo_/).length, 2);
});

test('filterByKey: no match returns empty', () => {
  assert.deepEqual(filterByKey([entry('a', 'b')], 'zzz'), []);
});

// ── filterByValue ─────────────────────────────────────────────────────────────

test('filterByValue: string substring match', () => {
  const entries = [entry('k1', '{"role":"admin"}'), entry('k2', '{"role":"user"}'), entry('k3', 'token')];
  assert.equal(filterByValue(entries, '"role"').length, 2);
});

test('filterByValue: RegExp match', () => {
  const entries = [entry('k1', 'abc123'), entry('k2', 'xyz'), entry('k3', 'def456')];
  assert.equal(filterByValue(entries, /\d+/).length, 2);
});

// ── search ────────────────────────────────────────────────────────────────────

test('search: matches in key', () => {
  const entries = [entry('auth_token', 'xyz'), entry('user_id', '42')];
  assert.equal(search(entries, 'auth').length, 1);
});

test('search: matches in value', () => {
  const entries = [entry('k1', 'hello world'), entry('k2', 'goodbye')];
  assert.equal(search(entries, 'hello').length, 1);
});

test('search: case-insensitive', () => {
  const entries = [entry('AUTH_TOKEN', 'ABC'), entry('other', 'xyz')];
  assert.equal(search(entries, 'auth_token').length, 1);
  assert.equal(search(entries, 'abc').length, 1);
});

test('search: matches either key or value', () => {
  const entries = [
    entry('session', 'abc'),
    entry('other',   'session-data'),
    entry('unrelated', 'none'),
  ];
  assert.equal(search(entries, 'session').length, 2);
});

test('search: no match returns empty', () => {
  assert.deepEqual(search([entry('a', 'b')], 'zzz'), []);
});

// ── toObject ──────────────────────────────────────────────────────────────────

test('toObject: converts entries to plain object', () => {
  const entries = [entry('a', '1'), entry('b', '2')];
  assert.deepEqual(toObject(entries), { a: '1', b: '2' });
});

test('toObject: empty entries returns empty object', () => {
  assert.deepEqual(toObject([]), {});
});

// ── fromObject ────────────────────────────────────────────────────────────────

test('fromObject: converts object to entries', () => {
  const entries = fromObject({ x: '1', y: '2' });
  assert.ok(entries.some((e) => e.key === 'x' && e.value === '1'));
  assert.ok(entries.some((e) => e.key === 'y' && e.value === '2'));
});

test('fromObject: coerces non-string values to string', () => {
  const entries = fromObject({ num: 42, bool: true });
  assert.equal(entries.find((e) => e.key === 'num').value,  '42');
  assert.equal(entries.find((e) => e.key === 'bool').value, 'true');
});

test('fromObject: throws for null', () => {
  assert.throws(() => fromObject(null), /obj/);
});

test('fromObject: throws for non-object', () => {
  assert.throws(() => fromObject('string'), /obj/);
});

test('fromObject: roundtrip with toObject', () => {
  const original = { foo: 'bar', baz: 'qux' };
  assert.deepEqual(toObject(fromObject(original)), original);
});

// ── sortByKey ─────────────────────────────────────────────────────────────────

test('sortByKey: sorts alphabetically', () => {
  const entries = [entry('z', '1'), entry('a', '2'), entry('m', '3')];
  const sorted  = sortByKey(entries);
  assert.deepEqual(sorted.map((e) => e.key), ['a', 'm', 'z']);
});

test('sortByKey: does not mutate original', () => {
  const entries = [entry('b', '1'), entry('a', '2')];
  sortByKey(entries);
  assert.equal(entries[0].key, 'b');
});

test('sortByKey: empty returns empty', () => {
  assert.deepEqual(sortByKey([]), []);
});

// ── summarize ─────────────────────────────────────────────────────────────────

test('summarize: correct count', () => {
  const entries = [entry('k1', 'abc'), entry('k2', 'defgh')];
  assert.equal(summarize(entries).count, 2);
});

test('summarize: totalBytes is key.length + value.length sum', () => {
  const entries = [entry('ab', 'cde'), entry('fg', 'h')];
  // 'ab'.length + 'cde'.length = 2+3 = 5, 'fg'.length + 'h'.length = 2+1 = 3 → total 8
  assert.equal(summarize(entries).totalBytes, 8);
});

test('summarize: largest is the entry with most combined bytes', () => {
  const entries = [entry('k', 'short'), entry('key', 'much longer value here')];
  const s = summarize(entries);
  assert.equal(s.largest.key, 'key');
});

test('summarize: empty entries', () => {
  const s = summarize([]);
  assert.equal(s.count,      0);
  assert.equal(s.totalBytes, 0);
  assert.equal(s.largest,    null);
});

// ── source checks ─────────────────────────────────────────────────────────────

test('BrowserService imports LocalStorageManager', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('LocalStorageManager'), 'LocalStorageManager import missing');
});

test('BrowserService includes lsGetAll method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('lsGetAll'), 'lsGetAll missing');
});

test('BrowserService includes lsSet method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('lsSet'), 'lsSet missing');
});

test('BrowserService includes lsImport method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('lsImport'), 'lsImport missing');
});

test('BrowserManager includes ls-get-all dispatch', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes("case 'ls-get-all'"), 'ls-get-all dispatch missing');
});

test('BrowserManager includes lsActions in capabilities', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes('lsActions'), 'lsActions missing from capabilities');
});
