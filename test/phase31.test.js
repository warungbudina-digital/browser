import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  VALID_METHODS,
  filterByMethod, filterByUrl, filterByStatus, filterByStatusRange,
  filterSince, filterBefore, groupByMethod, groupByStatus,
  summarize, formatText,
} from '../src/browser/RequestFilter.js';

// Helper — build a request entry
const mkReq = (method, url, status = 200, at = '2024-01-01T00:00:00.000Z') =>
  ({ method, url, status, at });

// ── VALID_METHODS ─────────────────────────────────────────────────────────────

test('VALID_METHODS: is a Set', () => {
  assert.ok(VALID_METHODS instanceof Set);
});

test('VALID_METHODS: contains standard HTTP methods', () => {
  for (const m of ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']) {
    assert.ok(VALID_METHODS.has(m), `missing: ${m}`);
  }
});

// ── filterByMethod ────────────────────────────────────────────────────────────

test('filterByMethod: filters by single method', () => {
  const reqs   = [mkReq('GET', '/a'), mkReq('POST', '/b'), mkReq('GET', '/c')];
  const result = filterByMethod(reqs, 'GET');
  assert.equal(result.length, 2);
  assert.ok(result.every((r) => r.method === 'GET'));
});

test('filterByMethod: filters by array of methods', () => {
  const reqs   = [mkReq('GET', '/a'), mkReq('POST', '/b'), mkReq('DELETE', '/c')];
  const result = filterByMethod(reqs, ['GET', 'DELETE']);
  assert.equal(result.length, 2);
});

test('filterByMethod: returns empty when no match', () => {
  assert.equal(filterByMethod([mkReq('GET', '/x')], 'POST').length, 0);
});

test('filterByMethod: returns copies — mutation safe', () => {
  const reqs   = [mkReq('GET', '/x')];
  const result = filterByMethod(reqs, 'GET');
  result[0].url = '/changed';
  assert.equal(reqs[0].url, '/x');
});

// ── filterByUrl ───────────────────────────────────────────────────────────────

test('filterByUrl: string does substring match', () => {
  const reqs = [mkReq('GET', '/api/users'), mkReq('GET', '/api/posts'), mkReq('GET', '/health')];
  assert.equal(filterByUrl(reqs, '/api').length, 2);
});

test('filterByUrl: RegExp match', () => {
  const reqs = [mkReq('GET', '/api/v1/users'), mkReq('GET', '/api/v2/users'), mkReq('GET', '/health')];
  assert.equal(filterByUrl(reqs, /\/api\/v\d/).length, 2);
});

test('filterByUrl: returns empty when no match', () => {
  assert.equal(filterByUrl([mkReq('GET', '/health')], '/missing').length, 0);
});

// ── filterByStatus ────────────────────────────────────────────────────────────

test('filterByStatus: filters by exact status', () => {
  const reqs = [mkReq('GET', '/a', 200), mkReq('GET', '/b', 404), mkReq('GET', '/c', 200)];
  assert.equal(filterByStatus(reqs, 200).length, 2);
});

test('filterByStatus: filters by array of statuses', () => {
  const reqs = [mkReq('GET', '/a', 200), mkReq('GET', '/b', 404), mkReq('GET', '/c', 500)];
  assert.equal(filterByStatus(reqs, [404, 500]).length, 2);
});

test('filterByStatus: excludes null-status entries', () => {
  const reqs = [mkReq('GET', '/a', null), mkReq('GET', '/b', 200)];
  assert.equal(filterByStatus(reqs, 200).length, 1);
});

// ── filterByStatusRange ───────────────────────────────────────────────────────

test('filterByStatusRange: returns entries within range', () => {
  const reqs = [mkReq('GET', '/a', 200), mkReq('GET', '/b', 301), mkReq('GET', '/c', 404)];
  const res  = filterByStatusRange(reqs, 200, 399);
  assert.equal(res.length, 2);
});

test('filterByStatusRange: boundaries are inclusive', () => {
  const reqs = [mkReq('GET', '/a', 400), mkReq('GET', '/b', 599)];
  assert.equal(filterByStatusRange(reqs, 400, 599).length, 2);
});

test('filterByStatusRange: excludes null-status entries', () => {
  const reqs = [mkReq('GET', '/a', null), mkReq('GET', '/b', 200)];
  assert.equal(filterByStatusRange(reqs, 200, 299).length, 1);
});

// ── filterSince / filterBefore ────────────────────────────────────────────────

test('filterSince: returns entries at or after given ISO', () => {
  const reqs = [
    mkReq('GET', '/a', 200, '2024-01-01T00:00:00.000Z'),
    mkReq('GET', '/b', 200, '2024-01-02T00:00:00.000Z'),
    mkReq('GET', '/c', 200, '2024-01-03T00:00:00.000Z'),
  ];
  assert.equal(filterSince(reqs, '2024-01-02T00:00:00.000Z').length, 2);
});

test('filterSince: boundary is inclusive', () => {
  const reqs = [mkReq('GET', '/x', 200, '2024-06-01T00:00:00.000Z')];
  assert.equal(filterSince(reqs, '2024-06-01T00:00:00.000Z').length, 1);
});

test('filterBefore: returns entries strictly before given ISO', () => {
  const reqs = [
    mkReq('GET', '/a', 200, '2024-01-01T00:00:00.000Z'),
    mkReq('GET', '/b', 200, '2024-01-03T00:00:00.000Z'),
  ];
  assert.equal(filterBefore(reqs, '2024-01-03T00:00:00.000Z').length, 1);
});

// ── groupByMethod ─────────────────────────────────────────────────────────────

test('groupByMethod: groups by method', () => {
  const reqs   = [mkReq('GET', '/a'), mkReq('POST', '/b'), mkReq('GET', '/c')];
  const groups = groupByMethod(reqs);
  assert.equal(groups.GET.length,  2);
  assert.equal(groups.POST.length, 1);
});

test('groupByMethod: returns empty object for empty input', () => {
  assert.deepEqual(groupByMethod([]), {});
});

test('groupByMethod: copies entries — mutation safe', () => {
  const reqs   = [mkReq('GET', '/x')];
  const groups = groupByMethod(reqs);
  groups.GET[0].url = '/changed';
  assert.equal(reqs[0].url, '/x');
});

// ── groupByStatus ─────────────────────────────────────────────────────────────

test('groupByStatus: groups by status code as string key', () => {
  const reqs   = [mkReq('GET', '/a', 200), mkReq('GET', '/b', 404), mkReq('GET', '/c', 200)];
  const groups = groupByStatus(reqs);
  assert.equal(groups['200'].length, 2);
  assert.equal(groups['404'].length, 1);
});

test('groupByStatus: null-status entries appear under "null" key', () => {
  const reqs   = [mkReq('GET', '/a', null)];
  const groups = groupByStatus(reqs);
  assert.ok(groups['null']);
  assert.equal(groups['null'].length, 1);
});

// ── summarize ─────────────────────────────────────────────────────────────────

test('summarize: counts total', () => {
  const reqs = [mkReq('GET', '/a', 200), mkReq('POST', '/b', 500), mkReq('GET', '/c', null)];
  assert.equal(summarize(reqs).total, 3);
});

test('summarize: counts byMethod', () => {
  const reqs = [mkReq('GET', '/a'), mkReq('GET', '/b'), mkReq('POST', '/c')];
  const s    = summarize(reqs);
  assert.equal(s.byMethod.GET,  2);
  assert.equal(s.byMethod.POST, 1);
});

test('summarize: counts failed (status >= 400)', () => {
  const reqs = [mkReq('GET', '/a', 200), mkReq('GET', '/b', 404), mkReq('GET', '/c', 500)];
  assert.equal(summarize(reqs).failed, 2);
});

test('summarize: counts nullStatus separately', () => {
  const reqs = [mkReq('GET', '/a', null), mkReq('GET', '/b', 200)];
  const s    = summarize(reqs);
  assert.equal(s.nullStatus, 1);
  assert.equal(s.byMethod.GET, 2);
});

test('summarize: first and last timestamps', () => {
  const reqs = [
    mkReq('GET', '/a', 200, '2024-01-02T00:00:00.000Z'),
    mkReq('GET', '/b', 200, '2024-01-01T00:00:00.000Z'),
    mkReq('GET', '/c', 200, '2024-01-03T00:00:00.000Z'),
  ];
  const s = summarize(reqs);
  assert.equal(s.first, '2024-01-01T00:00:00.000Z');
  assert.equal(s.last,  '2024-01-03T00:00:00.000Z');
});

test('summarize: empty → zeroes and null timestamps', () => {
  const s = summarize([]);
  assert.equal(s.total,      0);
  assert.equal(s.failed,     0);
  assert.equal(s.nullStatus, 0);
  assert.equal(s.first,      null);
  assert.equal(s.last,       null);
});

// ── formatText ────────────────────────────────────────────────────────────────

test('formatText: formats as METHOD STATUS url', () => {
  const text = formatText([mkReq('GET', '/api/users', 200)]);
  assert.ok(text.includes('GET'));
  assert.ok(text.includes('200'));
  assert.ok(text.includes('/api/users'));
});

test('formatText: null status renders as -', () => {
  const text = formatText([mkReq('GET', '/fail', null)]);
  assert.ok(text.includes('-'));
});

test('formatText: multiple entries joined with newline', () => {
  const reqs  = [mkReq('GET', '/a', 200), mkReq('POST', '/b', 404)];
  const lines = formatText(reqs).split('\n');
  assert.equal(lines.length, 2);
});

test('formatText: empty input → empty string', () => {
  assert.equal(formatText([]), '');
});

// ── source checks ─────────────────────────────────────────────────────────────

test('BrowserService source imports RequestFilter', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('RequestFilter'), 'RequestFilter import missing');
});

test('BrowserService source includes requestFilter method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('requestFilter'), 'requestFilter method missing');
});

test('BrowserManager source includes request-filter dispatch', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes("case 'request-filter'"), 'request-filter dispatch missing');
});

test('BrowserManager source includes requestFilterOps in capabilities', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes('requestFilterOps'), 'requestFilterOps missing from capabilities');
});
