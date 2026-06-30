import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  filterByName,
  filterByUrl,
  summarize,
} from '../src/browser/CacheAPIManager.js';

const names = ['api-cache', 'static-cache', 'image-cache', 'api-v2'];

// ── filterByName ──────────────────────────────────────────────────────────────

test('filterByName: substring matches all containing "cache"', () => {
  assert.equal(filterByName(names, 'cache').length, 3);
});

test('filterByName: substring narrows to partial match', () => {
  assert.deepEqual(filterByName(names, 'static'), ['static-cache']);
});

test('filterByName: RegExp prefix match', () => {
  assert.deepEqual(filterByName(names, /^api/), ['api-cache', 'api-v2']);
});

test('filterByName: RegExp suffix match', () => {
  const result = filterByName(names, /v2$/);
  assert.deepEqual(result, ['api-v2']);
});

test('filterByName: no match returns empty array', () => {
  assert.deepEqual(filterByName(names, 'zzz.invalid'), []);
});

test('filterByName: empty input returns empty array', () => {
  assert.deepEqual(filterByName([], 'api'), []);
});

// ── filterByUrl ───────────────────────────────────────────────────────────────

const entries = [
  { url: 'https://example.com/api/users', status: 200, headers: {} },
  { url: 'https://example.com/static/main.js', status: 200, headers: {} },
  { url: 'https://other.com/image.png', status: 200, headers: {} },
  { url: 'https://example.com/api/posts', status: 200, headers: {} },
];

test('filterByUrl: substring matches /api/ entries', () => {
  assert.equal(filterByUrl(entries, '/api/').length, 2);
});

test('filterByUrl: RegExp extension match', () => {
  const result = filterByUrl(entries, /\.js$/);
  assert.equal(result.length, 1);
  assert.ok(result[0].url.endsWith('.js'));
});

test('filterByUrl: domain substring match', () => {
  assert.equal(filterByUrl(entries, 'example.com').length, 3);
});

test('filterByUrl: no match returns empty array', () => {
  assert.deepEqual(filterByUrl(entries, 'zzz.invalid'), []);
});

test('filterByUrl: empty input returns empty array', () => {
  assert.deepEqual(filterByUrl([], 'api'), []);
});

// ── summarize ─────────────────────────────────────────────────────────────────

test('summarize: empty cacheMap returns zeros', () => {
  const s = summarize({});
  assert.equal(s.total, 0);
  assert.equal(s.entries, 0);
  assert.deepEqual(s.byCache, {});
});

test('summarize: single cache with entries', () => {
  const s = summarize({ 'api-cache': ['/a', '/b', '/c'] });
  assert.equal(s.total, 1);
  assert.equal(s.entries, 3);
  assert.equal(s.byCache['api-cache'], 3);
});

test('summarize: multiple caches', () => {
  const s = summarize({
    'api-cache': ['https://example.com/a', 'https://example.com/b'],
    'static-cache': ['https://example.com/main.js'],
  });
  assert.equal(s.total, 2);
  assert.equal(s.entries, 3);
  assert.equal(s.byCache['api-cache'], 2);
  assert.equal(s.byCache['static-cache'], 1);
});

test('summarize: cache with zero entries counted', () => {
  const s = summarize({ 'empty-cache': [] });
  assert.equal(s.total, 1);
  assert.equal(s.entries, 0);
  assert.equal(s.byCache['empty-cache'], 0);
});

test('summarize: entries total is sum across all caches', () => {
  const s = summarize({ a: ['u1', 'u2'], b: ['u3'], c: [] });
  assert.equal(s.entries, 3);
  assert.equal(s.total, 3);
});

// ── source checks ─────────────────────────────────────────────────────────────

test('BrowserService imports CacheAPIManager', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('CacheAPIManager'), 'CacheAPIManager import missing');
});

test('BrowserService includes cacheList method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('async cacheList'), 'cacheList missing');
});

test('BrowserService includes cacheEntries method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('async cacheEntries'), 'cacheEntries missing');
});

test('BrowserService includes cacheMatch method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('async cacheMatch'), 'cacheMatch missing');
});

test('BrowserService includes cachePut method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('async cachePut'), 'cachePut missing');
});

test('BrowserService includes cacheDelete method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('async cacheDelete'), 'cacheDelete missing');
});

test('BrowserService includes cacheClear method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('async cacheClear'), 'cacheClear missing');
});

test('BrowserService includes cacheDrop method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('async cacheDrop'), 'cacheDrop missing');
});

test('BrowserService includes cacheExport method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('async cacheExport'), 'cacheExport missing');
});

test('BrowserService includes cacheSummary method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('async cacheSummary'), 'cacheSummary missing');
});

test('BrowserManager includes cache-list dispatch', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes("case 'cache-list'"), 'cache-list dispatch missing');
});

test('BrowserManager includes cacheActions in capabilities', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes('cacheActions'), 'cacheActions missing from capabilities');
});
