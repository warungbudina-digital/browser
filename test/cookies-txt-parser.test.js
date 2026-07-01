import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCookiesTxt } from '../src/scraper/CookiesTxtParser.js';

test('parseCookiesTxt: empty/blank input returns empty array', () => {
  assert.deepEqual(parseCookiesTxt(''), []);
  assert.deepEqual(parseCookiesTxt('   \n  \n'), []);
  assert.deepEqual(parseCookiesTxt(undefined), []);
  assert.deepEqual(parseCookiesTxt(null), []);
});

test('parseCookiesTxt: skips header/comment lines', () => {
  const text = [
    '# Netscape HTTP Cookie File',
    '# This is a generated file! Do not edit.',
    '',
    '.tiktok.com\tTRUE\t/\tTRUE\t1999999999\tsessionid\tabc123',
  ].join('\n');
  const cookies = parseCookiesTxt(text);
  assert.equal(cookies.length, 1);
  assert.equal(cookies[0].name, 'sessionid');
});

test('parseCookiesTxt: parses a standard persistent cookie line', () => {
  const text = '.tiktok.com\tTRUE\t/\tTRUE\t1999999999\tsessionid\tabc123';
  const [cookie] = parseCookiesTxt(text);
  assert.deepEqual(cookie, {
    name: 'sessionid',
    value: 'abc123',
    domain: '.tiktok.com',
    path: '/',
    expires: 1999999999,
    httpOnly: false,
    secure: true,
  });
});

test('parseCookiesTxt: expiration 0 becomes session cookie (-1)', () => {
  const text = '.tiktok.com\tTRUE\t/\tFALSE\t0\tmsToken\txyz';
  const [cookie] = parseCookiesTxt(text);
  assert.equal(cookie.expires, -1);
  assert.equal(cookie.secure, false);
});

test('parseCookiesTxt: #HttpOnly_ prefix marks the cookie httpOnly and is not treated as a comment', () => {
  const text = '#HttpOnly_.tiktok.com\tTRUE\t/\tTRUE\t1999999999\tsid_tt\tsecretvalue';
  const cookies = parseCookiesTxt(text);
  assert.equal(cookies.length, 1);
  assert.equal(cookies[0].httpOnly, true);
  assert.equal(cookies[0].domain, '.tiktok.com');
  assert.equal(cookies[0].name, 'sid_tt');
});

test('parseCookiesTxt: includeSubdomains=TRUE prefixes domain with "." if missing', () => {
  const text = 'tiktok.com\tTRUE\t/\tTRUE\t1999999999\ta\tb';
  const [cookie] = parseCookiesTxt(text);
  assert.equal(cookie.domain, '.tiktok.com');
});

test('parseCookiesTxt: includeSubdomains=FALSE does not add a leading dot', () => {
  const text = 'www.tiktok.com\tFALSE\t/\tTRUE\t1999999999\ta\tb';
  const [cookie] = parseCookiesTxt(text);
  assert.equal(cookie.domain, 'www.tiktok.com');
});

test('parseCookiesTxt: skips malformed lines with too few fields', () => {
  const text = ['not\tenough\tfields', '.tiktok.com\tTRUE\t/\tTRUE\t1999999999\tok\tvalue'].join('\n');
  const cookies = parseCookiesTxt(text);
  assert.equal(cookies.length, 1);
  assert.equal(cookies[0].name, 'ok');
});

test('parseCookiesTxt: parses a realistic multi-cookie export', () => {
  const text = [
    '# Netscape HTTP Cookie File',
    '.tiktok.com\tTRUE\t/\tTRUE\t1999999999\tsessionid\taaa',
    '#HttpOnly_.tiktok.com\tTRUE\t/\tTRUE\t1999999999\tsid_tt\tbbb',
    '.tiktok.com\tTRUE\t/\tFALSE\t0\tmsToken\tccc',
  ].join('\n');
  const cookies = parseCookiesTxt(text);
  assert.equal(cookies.length, 3);
  assert.deepEqual(cookies.map((c) => c.name), ['sessionid', 'sid_tt', 'msToken']);
});
