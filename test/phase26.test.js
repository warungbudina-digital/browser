import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  filterByDomain, filterByName, filterByPath,
  filterExpired, groupByDomain, diffCookies,
  formatNetscape, parseNetscape,
} from '../src/browser/CookieFilter.js';

// Helper — build a minimal cookie object
const mkCookie = (overrides = {}) => ({
  name: 'session', value: 'abc', domain: 'example.com',
  path: '/', expires: -1, secure: false, httpOnly: false, sameSite: 'Lax',
  ...overrides,
});

// ── filterByDomain ────────────────────────────────────────────────────────────

test('filterByDomain: exact domain match', () => {
  const cookies = [mkCookie({ domain: 'example.com' }), mkCookie({ domain: 'other.com', name: 'x' })];
  const result  = filterByDomain(cookies, 'example.com');
  assert.equal(result.length, 1);
  assert.equal(result[0].domain, 'example.com');
});

test('filterByDomain: leading-dot domain matches base domain', () => {
  const cookies = [mkCookie({ domain: '.example.com' })];
  assert.equal(filterByDomain(cookies, 'example.com').length, 1);
});

test('filterByDomain: leading-dot domain matches subdomain', () => {
  const cookies = [mkCookie({ domain: '.example.com' })];
  assert.equal(filterByDomain(cookies, 'api.example.com').length, 1);
  assert.equal(filterByDomain(cookies, 'deep.api.example.com').length, 1);
});

test('filterByDomain: non-dot domain does NOT match subdomain', () => {
  const cookies = [mkCookie({ domain: 'example.com' })];
  assert.equal(filterByDomain(cookies, 'sub.example.com').length, 0);
});

test('filterByDomain: returns empty when no match', () => {
  assert.equal(filterByDomain([mkCookie()], 'other.com').length, 0);
});

test('filterByDomain: returns copies — mutation does not affect source', () => {
  const cookies = [mkCookie()];
  const result  = filterByDomain(cookies, 'example.com');
  result[0].value = 'mutated';
  assert.equal(cookies[0].value, 'abc');
});

// ── filterByName ──────────────────────────────────────────────────────────────

test('filterByName: string does substring match', () => {
  const cookies = [mkCookie({ name: 'auth_token' }), mkCookie({ name: 'auth_refresh' }), mkCookie({ name: 'theme' })];
  const result  = filterByName(cookies, 'auth');
  assert.equal(result.length, 2);
});

test('filterByName: string exact match when full name provided', () => {
  const cookies = [mkCookie({ name: 'session_id' }), mkCookie({ name: 'session' })];
  assert.equal(filterByName(cookies, 'session_id').length, 1);
});

test('filterByName: RegExp match', () => {
  const cookies = [mkCookie({ name: 'auth_token' }), mkCookie({ name: 'csrf_token' }), mkCookie({ name: 'theme' })];
  const result  = filterByName(cookies, /_token$/);
  assert.equal(result.length, 2);
});

test('filterByName: returns empty when no match', () => {
  assert.equal(filterByName([mkCookie()], 'ghost').length, 0);
});

// ── filterByPath ──────────────────────────────────────────────────────────────

test('filterByPath: exact path match', () => {
  const cookies = [mkCookie({ path: '/api' })];
  assert.equal(filterByPath(cookies, '/api').length, 1);
});

test('filterByPath: cookie with / matches any request path', () => {
  const cookies = [mkCookie({ path: '/' })];
  assert.equal(filterByPath(cookies, '/api/v2/data').length, 1);
});

test('filterByPath: cookie path prefix match', () => {
  const cookies = [mkCookie({ path: '/api' })];
  assert.equal(filterByPath(cookies, '/api/v2').length, 1);
  assert.equal(filterByPath(cookies, '/api/').length,   1);
});

test('filterByPath: cookie path does NOT match sibling path', () => {
  const cookies = [mkCookie({ path: '/api' })];
  assert.equal(filterByPath(cookies, '/apiv2').length, 0);
  assert.equal(filterByPath(cookies, '/other').length, 0);
});

// ── filterExpired ─────────────────────────────────────────────────────────────

test('filterExpired: returns cookies whose expires < now', () => {
  const past    = Math.floor((Date.now() - 1000) / 1000); // 1 second ago in seconds
  const cookies = [mkCookie({ expires: past }), mkCookie({ name: 'fresh' })];
  const result  = filterExpired(cookies);
  assert.equal(result.length, 1);
  assert.equal(result[0].expires, past);
});

test('filterExpired: session cookies (expires=-1) not included', () => {
  assert.equal(filterExpired([mkCookie({ expires: -1 })]).length, 0);
});

test('filterExpired: future expires not included', () => {
  const future = Math.floor((Date.now() + 1e6) / 1000);
  assert.equal(filterExpired([mkCookie({ expires: future })]).length, 0);
});

test('filterExpired: accepts custom now parameter', () => {
  const expires = 1000; // 1000 seconds since epoch
  const cookies = [mkCookie({ expires })];
  assert.equal(filterExpired(cookies, 2000 * 1000).length, 1); // now=2000s → expired
  assert.equal(filterExpired(cookies, 500  * 1000).length, 0); // now=500s  → not yet
});

// ── groupByDomain ─────────────────────────────────────────────────────────────

test('groupByDomain: groups cookies by domain', () => {
  const cookies = [
    mkCookie({ domain: 'a.com', name: 'x' }),
    mkCookie({ domain: 'b.com', name: 'y' }),
    mkCookie({ domain: 'a.com', name: 'z' }),
  ];
  const groups = groupByDomain(cookies);
  assert.equal(groups['a.com'].length, 2);
  assert.equal(groups['b.com'].length, 1);
});

test('groupByDomain: returns empty object for empty input', () => {
  assert.deepEqual(groupByDomain([]), {});
});

test('groupByDomain: copies cookies — mutation does not affect source', () => {
  const cookies = [mkCookie()];
  const groups  = groupByDomain(cookies);
  groups['example.com'][0].value = 'changed';
  assert.equal(cookies[0].value, 'abc');
});

// ── diffCookies ───────────────────────────────────────────────────────────────

test('diffCookies: detects added cookies', () => {
  const before = [mkCookie({ name: 'a' })];
  const after  = [mkCookie({ name: 'a' }), mkCookie({ name: 'b' })];
  const diff   = diffCookies(before, after);
  assert.equal(diff.added.length, 1);
  assert.equal(diff.added[0].name, 'b');
  assert.equal(diff.removed.length, 0);
});

test('diffCookies: detects removed cookies', () => {
  const before = [mkCookie({ name: 'a' }), mkCookie({ name: 'b' })];
  const after  = [mkCookie({ name: 'a' })];
  const diff   = diffCookies(before, after);
  assert.equal(diff.removed.length, 1);
  assert.equal(diff.removed[0].name, 'b');
});

test('diffCookies: detects changed cookie values', () => {
  const before = [mkCookie({ name: 'tok', value: 'old' })];
  const after  = [mkCookie({ name: 'tok', value: 'new' })];
  const diff   = diffCookies(before, after);
  assert.equal(diff.changed.length, 1);
  assert.equal(diff.changed[0].before, 'old');
  assert.equal(diff.changed[0].after,  'new');
});

test('diffCookies: identical arrays produce empty diff', () => {
  const cookies = [mkCookie()];
  const diff    = diffCookies(cookies, cookies.map((c) => ({ ...c })));
  assert.equal(diff.added.length,   0);
  assert.equal(diff.removed.length, 0);
  assert.equal(diff.changed.length, 0);
});

test('diffCookies: both empty → empty diff', () => {
  assert.deepEqual(diffCookies([], []), { added: [], removed: [], changed: [] });
});

// ── formatNetscape ────────────────────────────────────────────────────────────

test('formatNetscape: output starts with Netscape header comment', () => {
  const text = formatNetscape([]);
  assert.ok(text.startsWith('# Netscape HTTP Cookie File'));
});

test('formatNetscape: cookie line has 7 tab-separated fields', () => {
  const cookie = mkCookie({ domain: '.example.com', name: 'tok', value: 'xyz', path: '/', secure: true, expires: 1700000000 });
  const lines  = formatNetscape([cookie]).split('\n').filter((l) => l && !l.startsWith('#'));
  const fields = lines[0].split('\t');
  assert.equal(fields.length, 7);
});

test('formatNetscape: leading-dot domain sets subdomains field to TRUE', () => {
  const text   = formatNetscape([mkCookie({ domain: '.example.com' })]);
  const line   = text.split('\n').find((l) => l.includes('example.com'));
  const fields = line.split('\t');
  assert.equal(fields[1], 'TRUE');
});

test('formatNetscape: non-dot domain sets subdomains field to FALSE', () => {
  const text   = formatNetscape([mkCookie({ domain: 'example.com' })]);
  const line   = text.split('\n').find((l) => l.includes('example.com'));
  const fields = line.split('\t');
  assert.equal(fields[1], 'FALSE');
});

test('formatNetscape: secure=true sets secure field to TRUE', () => {
  const text   = formatNetscape([mkCookie({ secure: true })]);
  const line   = text.split('\n').find((l) => l.includes('\t'));
  const fields = line.split('\t');
  assert.equal(fields[3], 'TRUE');
});

test('formatNetscape: session cookie (expires=-1) sets expires field to 0', () => {
  const text   = formatNetscape([mkCookie({ expires: -1 })]);
  const line   = text.split('\n').find((l) => l.includes('\t'));
  const fields = line.split('\t');
  assert.equal(fields[4], '0');
});

// ── parseNetscape ─────────────────────────────────────────────────────────────

test('parseNetscape: ignores comment and blank lines', () => {
  const text   = '# Netscape HTTP Cookie File\n#\n\n';
  const result = parseNetscape(text);
  assert.equal(result.length, 0);
});

test('parseNetscape: parses a basic cookie line', () => {
  const text   = '# Netscape HTTP Cookie File\n.example.com\tTRUE\t/\tFALSE\t0\ttoken\tabc\n';
  const result = parseNetscape(text);
  assert.equal(result.length, 1);
  assert.equal(result[0].domain, '.example.com');
  assert.equal(result[0].name,   'token');
  assert.equal(result[0].value,  'abc');
  assert.equal(result[0].secure, false);
  assert.equal(result[0].expires, -1);
});

test('parseNetscape: round-trips with formatNetscape', () => {
  const original = [
    mkCookie({ domain: '.example.com', name: 'session', value: 'xyz123', path: '/', secure: true, expires: 1700000000 }),
    mkCookie({ domain: 'api.example.com', name: 'csrf', value: 'tok', path: '/api', secure: false, expires: -1 }),
  ];
  const text   = formatNetscape(original);
  const parsed = parseNetscape(text);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].name,  original[0].name);
  assert.equal(parsed[0].value, original[0].value);
  assert.equal(parsed[1].name,  original[1].name);
});

// ── BrowserService / BrowserManager source checks ─────────────────────────────

test('BrowserService source includes CookieFilter import', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('CookieFilter'), 'CookieFilter import missing');
});

test('BrowserService source includes cookieFilter method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('cookieFilter'), 'cookieFilter method missing');
});

test('BrowserManager source includes cookie-filter dispatch', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes("case 'cookie-filter'"), 'cookie-filter dispatch missing');
});

test('BrowserManager source includes cookieFilterOps in capabilities', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes('cookieFilterOps'), 'cookieFilterOps missing from capabilities');
});
