import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  storageFilename, serializeStorage, parseStorageFile,
  filterStorageKeys, diffStorage, VALID_STORAGE_KINDS,
} from '../src/browser/StoragePersistence.js';

// ── VALID_STORAGE_KINDS export ────────────────────────────────────────────────

test('VALID_STORAGE_KINDS: is a Set with localStorage and sessionStorage', () => {
  assert.ok(VALID_STORAGE_KINDS instanceof Set);
  assert.ok(VALID_STORAGE_KINDS.has('localStorage'));
  assert.ok(VALID_STORAGE_KINDS.has('sessionStorage'));
  assert.equal(VALID_STORAGE_KINDS.size, 2);
});

// ── storageFilename ───────────────────────────────────────────────────────────

test('storageFilename: returns sanitized name with .json extension', () => {
  assert.equal(storageFilename('my-app'), 'my-app.json');
});

test('storageFilename: sanitizes spaces and special chars to hyphens', () => {
  const result = storageFilename('my app state!');
  assert.ok(result.endsWith('.json'));
  assert.ok(!result.includes(' '));
  assert.ok(!result.includes('!'));
});

test('storageFilename: preserves dots, hyphens, underscores', () => {
  assert.equal(storageFilename('auth_v2.prod'), 'auth_v2.prod.json');
});

test('storageFilename: throws for null name', () => {
  assert.throws(() => storageFilename(null), /required/i);
});

test('storageFilename: throws for undefined name', () => {
  assert.throws(() => storageFilename(undefined), /required/i);
});

test('storageFilename: throws for blank/whitespace name', () => {
  assert.throws(() => storageFilename('   '), /blank/i);
});

// ── serializeStorage ──────────────────────────────────────────────────────────

test('serializeStorage: returns object with version, entries, entryCount, savedAt', () => {
  const result = serializeStorage({ key1: 'val1' });
  assert.equal(result.version, 1);
  assert.ok(Array.isArray(result.entries));
  assert.equal(result.entryCount, 1);
  assert.ok(result.savedAt, 'savedAt should be set');
});

test('serializeStorage: maps raw object to [{key, value}] entries', () => {
  const result = serializeStorage({ token: 'abc', theme: 'dark' });
  assert.ok(result.entries.some((e) => e.key === 'token' && e.value === 'abc'));
  assert.ok(result.entries.some((e) => e.key === 'theme' && e.value === 'dark'));
});

test('serializeStorage: empty raw object returns entries=[] and entryCount=0', () => {
  const result = serializeStorage({});
  assert.deepEqual(result.entries, []);
  assert.equal(result.entryCount, 0);
});

test('serializeStorage: null raw treated as empty', () => {
  const result = serializeStorage(null);
  assert.deepEqual(result.entries, []);
});

test('serializeStorage: stores kind and profile in output', () => {
  const result = serializeStorage({ k: 'v' }, { profile: 'default', kind: 'localStorage' });
  assert.equal(result.kind,    'localStorage');
  assert.equal(result.profile, 'default');
});

test('serializeStorage: kind and profile default to null when not provided', () => {
  const result = serializeStorage({});
  assert.equal(result.kind,    null);
  assert.equal(result.profile, null);
});

// ── parseStorageFile ──────────────────────────────────────────────────────────

test('parseStorageFile: returns entries, kind, profile from valid data', () => {
  const data = { version: 1, entries: [{ key: 'x', value: '1' }], kind: 'localStorage', profile: 'p' };
  const result = parseStorageFile(data);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].key,   'x');
  assert.equal(result.entries[0].value, '1');
  assert.equal(result.kind,    'localStorage');
  assert.equal(result.profile, 'p');
});

test('parseStorageFile: throws for null input', () => {
  assert.throws(() => parseStorageFile(null), /invalid/i);
});

test('parseStorageFile: throws for non-object input', () => {
  assert.throws(() => parseStorageFile('string'), /invalid/i);
});

test('parseStorageFile: throws when version is missing', () => {
  assert.throws(() => parseStorageFile({ entries: [] }), /version/i);
});

test('parseStorageFile: throws when version is wrong', () => {
  assert.throws(() => parseStorageFile({ version: 99, entries: [] }), /version/i);
});

test('parseStorageFile: throws when entries is not an array', () => {
  assert.throws(() => parseStorageFile({ version: 1, entries: 'bad' }), /entries/i);
});

test('parseStorageFile: round-trips with serializeStorage', () => {
  const raw  = { foo: 'bar', baz: '42' };
  const file = serializeStorage(raw, { kind: 'sessionStorage', profile: 'x' });
  const back = parseStorageFile(file);
  assert.equal(back.entries.length, 2);
  assert.equal(back.kind,    'sessionStorage');
  assert.equal(back.profile, 'x');
});

// ── filterStorageKeys ─────────────────────────────────────────────────────────

const SAMPLE = [
  { key: 'auth_token', value: 'abc' },
  { key: 'user_id',    value: '42' },
  { key: 'theme',      value: 'dark' },
  { key: 'auth_refresh', value: 'xyz' },
];

test('filterStorageKeys: returns all entries when pattern is null', () => {
  assert.equal(filterStorageKeys(SAMPLE, null).length, SAMPLE.length);
});

test('filterStorageKeys: returns all entries when pattern is undefined', () => {
  assert.equal(filterStorageKeys(SAMPLE).length, SAMPLE.length);
});

test('filterStorageKeys: filters by string substring match', () => {
  const result = filterStorageKeys(SAMPLE, 'auth');
  assert.equal(result.length, 2);
  assert.ok(result.every((e) => e.key.includes('auth')));
});

test('filterStorageKeys: returns empty array when no keys match string', () => {
  assert.equal(filterStorageKeys(SAMPLE, 'notpresent').length, 0);
});

test('filterStorageKeys: filters by RegExp match', () => {
  const result = filterStorageKeys(SAMPLE, /^auth/);
  assert.equal(result.length, 2);
});

test('filterStorageKeys: returns copies — mutation does not affect source entries', () => {
  const entries = [{ key: 'x', value: '1' }];
  const result  = filterStorageKeys(entries);
  result[0].value = 'mutated';
  assert.equal(entries[0].value, '1');
});

// ── diffStorage ───────────────────────────────────────────────────────────────

test('diffStorage: detects added keys', () => {
  const before = [{ key: 'a', value: '1' }];
  const after  = [{ key: 'a', value: '1' }, { key: 'b', value: '2' }];
  const diff   = diffStorage(before, after);
  assert.equal(diff.added.length, 1);
  assert.equal(diff.added[0].key, 'b');
  assert.equal(diff.removed.length, 0);
  assert.equal(diff.changed.length, 0);
});

test('diffStorage: detects removed keys', () => {
  const before = [{ key: 'a', value: '1' }, { key: 'b', value: '2' }];
  const after  = [{ key: 'a', value: '1' }];
  const diff   = diffStorage(before, after);
  assert.equal(diff.removed.length, 1);
  assert.equal(diff.removed[0].key, 'b');
  assert.equal(diff.added.length, 0);
});

test('diffStorage: detects changed values', () => {
  const before = [{ key: 'x', value: 'old' }];
  const after  = [{ key: 'x', value: 'new' }];
  const diff   = diffStorage(before, after);
  assert.equal(diff.changed.length, 1);
  assert.equal(diff.changed[0].key,    'x');
  assert.equal(diff.changed[0].before, 'old');
  assert.equal(diff.changed[0].after,  'new');
});

test('diffStorage: unchanged keys appear in no diff bucket', () => {
  const entries = [{ key: 'same', value: 'val' }];
  const diff    = diffStorage(entries, entries);
  assert.equal(diff.added.length,   0);
  assert.equal(diff.removed.length, 0);
  assert.equal(diff.changed.length, 0);
});

test('diffStorage: both arrays empty returns empty diff', () => {
  const diff = diffStorage([], []);
  assert.deepEqual(diff, { added: [], removed: [], changed: [] });
});

test('diffStorage: identical arrays return empty diff', () => {
  const entries = [{ key: 'a', value: '1' }, { key: 'b', value: '2' }];
  const diff    = diffStorage(entries, [...entries.map((e) => ({ ...e }))]);
  assert.equal(diff.added.length,   0);
  assert.equal(diff.removed.length, 0);
  assert.equal(diff.changed.length, 0);
});

// ── BrowserService / BrowserManager source checks ─────────────────────────────

test('BrowserService source includes StoragePersistence import', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('StoragePersistence'), 'StoragePersistence import missing');
});

test('BrowserService source includes storageSave, storageLoad, storageList, storageDelete', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('storageSave'),   'storageSave missing');
  assert.ok(src.includes('storageLoad'),   'storageLoad missing');
  assert.ok(src.includes('storageList'),   'storageList missing');
  assert.ok(src.includes('storageDelete'), 'storageDelete missing');
});

test('BrowserManager source includes storage-save, storage-load, storage-list, storage-delete dispatch', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes("case 'storage-save'"),   'storage-save dispatch missing');
  assert.ok(src.includes("case 'storage-load'"),   'storage-load dispatch missing');
  assert.ok(src.includes("case 'storage-list'"),   'storage-list dispatch missing');
  assert.ok(src.includes("case 'storage-delete'"), 'storage-delete dispatch missing');
});

test('BrowserManager source includes storageActions in capabilities', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes('storageActions'), 'storageActions missing from capabilities');
});
