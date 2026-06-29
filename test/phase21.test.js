import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HarRecorder } from '../src/browser/HarRecorder.js';

// ── add: valid inputs ─────────────────────────────────────────────────────────

test('HarRecorder: add returns entry with id, targetId, uppercased method, url', () => {
  const rec   = new HarRecorder();
  const entry = rec.add({ targetId: 't1', method: 'get', url: 'https://example.com/' });
  assert.ok(entry.id, 'id should be set');
  assert.equal(entry.targetId, 't1');
  assert.equal(entry.method,   'GET');
  assert.equal(entry.url,      'https://example.com/');
});

test('HarRecorder: add defaults status=-1, bodySize=-1, timeMs=-1', () => {
  const entry = new HarRecorder().add({ targetId: 't1', method: 'GET', url: 'https://a.com' });
  assert.equal(entry.status,   -1);
  assert.equal(entry.bodySize, -1);
  assert.equal(entry.timeMs,   -1);
});

test('HarRecorder: add defaults mimeType to application/octet-stream', () => {
  const entry = new HarRecorder().add({ targetId: 't1', method: 'GET', url: 'https://a.com' });
  assert.equal(entry.mimeType, 'application/octet-stream');
});

test('HarRecorder: add uses provided startedAt', () => {
  const ts    = '2024-06-01T12:00:00.000Z';
  const entry = new HarRecorder().add({ targetId: 't1', method: 'GET', url: 'https://a.com', startedAt: ts });
  assert.equal(entry.startedAt, ts);
});

test('HarRecorder: add stores requestHeaders and responseHeaders normalised', () => {
  const entry = new HarRecorder().add({
    targetId: 't1', method: 'POST', url: 'https://a.com/api',
    requestHeaders:  [{ name: 'Content-Type', value: 'application/json' }],
    responseHeaders: [{ name: 'X-Custom', value: 'yes' }],
  });
  assert.deepEqual(entry.requestHeaders,  [{ name: 'Content-Type', value: 'application/json' }]);
  assert.deepEqual(entry.responseHeaders, [{ name: 'X-Custom',     value: 'yes' }]);
});

// ── add: validation ───────────────────────────────────────────────────────────

test('HarRecorder: add without targetId throws', () => {
  assert.throws(() => new HarRecorder().add({ method: 'GET', url: 'https://a.com' }), /targetId/i);
});

test('HarRecorder: add with null targetId throws', () => {
  assert.throws(() => new HarRecorder().add({ targetId: null, method: 'GET', url: 'https://a.com' }), /targetId/i);
});

test('HarRecorder: add without method throws', () => {
  assert.throws(() => new HarRecorder().add({ targetId: 't1', url: 'https://a.com' }), /method/i);
});

test('HarRecorder: add without url throws', () => {
  assert.throws(() => new HarRecorder().add({ targetId: 't1', method: 'GET' }), /url/i);
});

// ── size / sizeFor ────────────────────────────────────────────────────────────

test('HarRecorder: size is 0 initially', () => {
  assert.equal(new HarRecorder().size, 0);
});

test('HarRecorder: size increments with each add', () => {
  const rec = new HarRecorder();
  rec.add({ targetId: 't1', method: 'GET', url: 'https://a.com/1' });
  rec.add({ targetId: 't2', method: 'GET', url: 'https://a.com/2' });
  assert.equal(rec.size, 2);
});

test('HarRecorder: sizeFor returns count for specific targetId', () => {
  const rec = new HarRecorder();
  rec.add({ targetId: 't1', method: 'GET', url: 'https://a.com/1' });
  rec.add({ targetId: 't1', method: 'GET', url: 'https://a.com/2' });
  rec.add({ targetId: 't2', method: 'GET', url: 'https://a.com/3' });
  assert.equal(rec.sizeFor('t1'), 2);
  assert.equal(rec.sizeFor('t2'), 1);
});

test('HarRecorder: sizeFor returns 0 for unknown targetId', () => {
  assert.equal(new HarRecorder().sizeFor('no-such-target'), 0);
});

// ── list ──────────────────────────────────────────────────────────────────────

test('HarRecorder: list returns empty array initially', () => {
  assert.deepEqual(new HarRecorder().list(), []);
});

test('HarRecorder: list returns all entries without filter', () => {
  const rec = new HarRecorder();
  rec.add({ targetId: 't1', method: 'GET', url: 'https://a.com/1' });
  rec.add({ targetId: 't2', method: 'GET', url: 'https://a.com/2' });
  assert.equal(rec.list().length, 2);
});

test('HarRecorder: list filters by targetId', () => {
  const rec = new HarRecorder();
  rec.add({ targetId: 't1', method: 'GET', url: 'https://a.com/1' });
  rec.add({ targetId: 't2', method: 'GET', url: 'https://a.com/2' });
  rec.add({ targetId: 't1', method: 'GET', url: 'https://a.com/3' });
  const result = rec.list({ targetId: 't1' });
  assert.equal(result.length, 2);
  assert.ok(result.every((e) => e.targetId === 't1'));
});

test('HarRecorder: list filters by urlFilter substring', () => {
  const rec = new HarRecorder();
  rec.add({ targetId: 't1', method: 'GET', url: 'https://api.example.com/data' });
  rec.add({ targetId: 't1', method: 'GET', url: 'https://cdn.example.com/img.png' });
  const result = rec.list({ urlFilter: '/api.' });
  assert.equal(result.length, 1);
  assert.ok(result[0].url.includes('/api.'));
});

test('HarRecorder: list with limit returns first N entries', () => {
  const rec = new HarRecorder();
  rec.add({ targetId: 't1', method: 'GET', url: 'https://a.com/1' });
  rec.add({ targetId: 't1', method: 'GET', url: 'https://a.com/2' });
  rec.add({ targetId: 't1', method: 'GET', url: 'https://a.com/3' });
  const result = rec.list({ limit: 2 });
  assert.equal(result.length, 2);
  assert.ok(result[0].url.endsWith('/1'));
  assert.ok(result[1].url.endsWith('/2'));
});

test('HarRecorder: list returns copies — mutation does not affect store', () => {
  const rec = new HarRecorder();
  rec.add({ targetId: 't1', method: 'GET', url: 'https://a.com' });
  const result = rec.list();
  result[0].method = 'DELETE';
  assert.equal(rec.list()[0].method, 'GET');
});

// ── clear / clearAll ──────────────────────────────────────────────────────────

test('HarRecorder: clear removes entries for targetId and returns removed count', () => {
  const rec = new HarRecorder();
  rec.add({ targetId: 't1', method: 'GET', url: 'https://a.com/1' });
  rec.add({ targetId: 't1', method: 'GET', url: 'https://a.com/2' });
  rec.add({ targetId: 't2', method: 'GET', url: 'https://a.com/3' });
  const removed = rec.clear('t1');
  assert.equal(removed, 2);
  assert.equal(rec.size, 1);
  assert.equal(rec.sizeFor('t1'), 0);
  assert.equal(rec.sizeFor('t2'), 1);
});

test('HarRecorder: clear without targetId throws', () => {
  assert.throws(() => new HarRecorder().clear(), /targetId/i);
});

test('HarRecorder: clear with empty string targetId throws', () => {
  assert.throws(() => new HarRecorder().clear(''), /targetId/i);
});

test('HarRecorder: clearAll removes all entries and returns total count', () => {
  const rec = new HarRecorder();
  rec.add({ targetId: 't1', method: 'GET', url: 'https://a.com/1' });
  rec.add({ targetId: 't2', method: 'GET', url: 'https://a.com/2' });
  const removed = rec.clearAll();
  assert.equal(removed, 2);
  assert.equal(rec.size, 0);
});

// ── toHAR ─────────────────────────────────────────────────────────────────────

test('HarRecorder: toHAR returns HAR 1.2 structure', () => {
  const har = new HarRecorder().toHAR();
  assert.ok(har.log, 'har.log missing');
  assert.equal(har.log.version, '1.2');
  assert.ok(Array.isArray(har.log.entries));
});

test('HarRecorder: toHAR log.creator has name and version', () => {
  const { log } = new HarRecorder().toHAR();
  assert.ok(log.creator.name,    'creator.name missing');
  assert.ok(log.creator.version, 'creator.version missing');
});

test('HarRecorder: toHAR log.entries maps all entries when no targetId given', () => {
  const rec = new HarRecorder();
  rec.add({ targetId: 't1', method: 'GET', url: 'https://a.com/1' });
  rec.add({ targetId: 't2', method: 'GET', url: 'https://a.com/2' });
  assert.equal(rec.toHAR().log.entries.length, 2);
});

test('HarRecorder: toHAR filters log.entries by targetId', () => {
  const rec = new HarRecorder();
  rec.add({ targetId: 't1', method: 'GET', url: 'https://a.com/1' });
  rec.add({ targetId: 't2', method: 'GET', url: 'https://a.com/2' });
  const har = rec.toHAR({ targetId: 't1' });
  assert.equal(har.log.entries.length, 1);
});

test('HarRecorder: toHAR entry has required HAR fields', () => {
  const rec = new HarRecorder();
  rec.add({ targetId: 't1', method: 'GET', url: 'https://a.com/', status: 200, timeMs: 150 });
  const [entry] = rec.toHAR().log.entries;
  assert.ok(entry.startedDateTime, 'startedDateTime missing');
  assert.equal(entry.time, 150);
  assert.ok(entry.request,  'request missing');
  assert.ok(entry.response, 'response missing');
  assert.ok(entry.cache != null, 'cache missing');
  assert.ok(entry.timings, 'timings missing');
});

test('HarRecorder: toHAR entry.request has method, url, httpVersion, headers, queryString', () => {
  const rec = new HarRecorder();
  rec.add({ targetId: 't1', method: 'POST', url: 'https://a.com/api', requestHeaders: [{ name: 'Accept', value: '*/*' }] });
  const { request } = rec.toHAR().log.entries[0];
  assert.equal(request.method,      'POST');
  assert.equal(request.url,         'https://a.com/api');
  assert.equal(request.httpVersion, 'HTTP/1.1');
  assert.ok(Array.isArray(request.headers),     'headers should be array');
  assert.ok(Array.isArray(request.queryString), 'queryString should be array');
  assert.ok(Array.isArray(request.cookies),     'cookies should be array');
});

test('HarRecorder: toHAR entry.response has status, statusText, headers, content', () => {
  const rec = new HarRecorder();
  rec.add({ targetId: 't1', method: 'GET', url: 'https://a.com/', status: 200, mimeType: 'text/html', bodySize: 4096 });
  const { response } = rec.toHAR().log.entries[0];
  assert.equal(response.status,          200);
  assert.equal(response.statusText,      'OK');
  assert.equal(response.content.mimeType,'text/html');
  assert.equal(response.content.size,    4096);
  assert.equal(response.bodySize,        4096);
});

test('HarRecorder: toHAR queryString parses URL search params', () => {
  const rec = new HarRecorder();
  rec.add({ targetId: 't1', method: 'GET', url: 'https://a.com/search?q=hello&page=2' });
  const { queryString } = rec.toHAR().log.entries[0].request;
  assert.equal(queryString.length, 2);
  assert.ok(queryString.some((p) => p.name === 'q' && p.value === 'hello'));
  assert.ok(queryString.some((p) => p.name === 'page' && p.value === '2'));
});

test('HarRecorder: toHAR statusText maps known HTTP codes', () => {
  const rec = new HarRecorder();
  const codes = { 200: 'OK', 201: 'Created', 404: 'Not Found', 500: 'Internal Server Error' };
  for (const [status, text] of Object.entries(codes)) {
    rec.add({ targetId: 't1', method: 'GET', url: 'https://a.com/', status: Number(status) });
  }
  const entries = rec.toHAR().log.entries;
  assert.equal(entries[0].response.statusText, 'OK');
  assert.equal(entries[1].response.statusText, 'Created');
  assert.equal(entries[2].response.statusText, 'Not Found');
  assert.equal(entries[3].response.statusText, 'Internal Server Error');
});

test('HarRecorder: toHAR statusText is empty string for unknown code', () => {
  const rec = new HarRecorder();
  rec.add({ targetId: 't1', method: 'GET', url: 'https://a.com/', status: 999 });
  assert.equal(rec.toHAR().log.entries[0].response.statusText, '');
});

test('HarRecorder: toHAR timings.wait is max(0, timeMs)', () => {
  const rec = new HarRecorder();
  rec.add({ targetId: 't1', method: 'GET', url: 'https://a.com/', timeMs: 250 });
  rec.add({ targetId: 't1', method: 'GET', url: 'https://b.com/', timeMs: -1 });
  const [e1, e2] = rec.toHAR().log.entries;
  assert.equal(e1.timings.wait, 250);
  assert.equal(e2.timings.wait, 0);
});

// ── BrowserService / BrowserManager source checks ─────────────────────────────

test('BrowserService source includes harGet and harClear methods', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('harGet'),   'harGet method missing from BrowserService');
  assert.ok(src.includes('harClear'), 'harClear method missing from BrowserService');
});

test('BrowserService source includes HarRecorder import', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('HarRecorder'), 'HarRecorder import missing from BrowserService');
});

test('BrowserManager source includes har-get and har-clear dispatch', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes("case 'har-get'"),   'har-get dispatch missing');
  assert.ok(src.includes("case 'har-clear'"), 'har-clear dispatch missing');
});

test('BrowserManager source includes harActions in capabilities', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes('harActions'), 'harActions missing from capabilities');
});
