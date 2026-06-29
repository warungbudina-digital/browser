import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sessionFilename,
  serializeSession,
  parseSessionFile,
  filterExpiredCookies,
  SESSION_VERSION,
} from '../src/browser/SessionPersistence.js';

// ── sessionFilename ───────────────────────────────────────────────────────────

test('sessionFilename: valid name → "<name>.json"', () => {
  assert.equal(sessionFilename('my-session'), 'my-session.json');
  assert.equal(sessionFilename('login_v2'),   'login_v2.json');
  assert.equal(sessionFilename('A1B2C3'),     'A1B2C3.json');
});

test('sessionFilename: trims surrounding whitespace', () => {
  assert.equal(sessionFilename('  auth  '), 'auth.json');
});

test('sessionFilename: null/undefined throws', () => {
  assert.throws(() => sessionFilename(null),      /required/i);
  assert.throws(() => sessionFilename(undefined), /required/i);
});

test('sessionFilename: blank/whitespace-only throws', () => {
  assert.throws(() => sessionFilename(''),    /blank/i);
  assert.throws(() => sessionFilename('   '), /blank/i);
});

test('sessionFilename: path traversal ".." throws', () => {
  assert.throws(() => sessionFilename('../etc/passwd'), /path separator/i);
  assert.throws(() => sessionFilename('foo/../bar'),    /path separator/i);
});

test('sessionFilename: forward slash throws', () => {
  assert.throws(() => sessionFilename('a/b'), /path separator/i);
});

test('sessionFilename: backslash throws', () => {
  assert.throws(() => sessionFilename('a\\b'), /path separator/i);
});

test('sessionFilename: special chars (dot, space, @) throws', () => {
  assert.throws(() => sessionFilename('my.session'), /only contain/i);
  assert.throws(() => sessionFilename('my session'), /only contain/i);
  assert.throws(() => sessionFilename('user@host'),  /only contain/i);
});

test('sessionFilename: name exceeding 64 chars throws', () => {
  assert.throws(() => sessionFilename('a'.repeat(65)), /only contain/i);
});

// ── serializeSession ──────────────────────────────────────────────────────────

test('serializeSession: wraps Playwright storageState in envelope', () => {
  const raw = {
    cookies: [{ name: 'sid', value: 'abc', domain: 'x.test' }],
    origins: [{ origin: 'https://x.test', localStorage: [] }],
  };
  const s = serializeSession(raw, { profile: 'openclaw' });
  assert.equal(s.version,     SESSION_VERSION);
  assert.equal(s.profile,     'openclaw');
  assert.equal(s.cookieCount, 1);
  assert.equal(s.originCount, 1);
  assert.ok(s.savedAt, 'savedAt should be set');
  assert.deepEqual(s.cookies, raw.cookies);
  assert.deepEqual(s.origins, raw.origins);
});

test('serializeSession: missing cookies defaults to []', () => {
  const s = serializeSession({ origins: [] });
  assert.deepEqual(s.cookies, []);
  assert.equal(s.cookieCount, 0);
});

test('serializeSession: missing origins defaults to []', () => {
  const s = serializeSession({ cookies: [] });
  assert.deepEqual(s.origins, []);
  assert.equal(s.originCount, 0);
});

test('serializeSession: null storageState throws', () => {
  assert.throws(() => serializeSession(null), /non-null/i);
});

test('serializeSession: accepts custom savedAt', () => {
  const ts = '2025-01-01T00:00:00.000Z';
  const s  = serializeSession({ cookies: [], origins: [] }, { savedAt: ts });
  assert.equal(s.savedAt, ts);
});

// ── parseSessionFile ──────────────────────────────────────────────────────────

test('parseSessionFile: accepts our envelope format', () => {
  const raw = {
    version: SESSION_VERSION,
    savedAt: '2025-01-01T00:00:00.000Z',
    profile: 'openclaw',
    cookies: [{ name: 'sid', value: 'abc' }],
    origins: [],
    cookieCount: 1,
    originCount: 0,
  };
  const r = parseSessionFile(raw);
  assert.equal(r.cookies.length, 1);
  assert.deepEqual(r.origins, []);
  assert.equal(r.profile,  'openclaw');
  assert.equal(r.savedAt,  '2025-01-01T00:00:00.000Z');
});

test('parseSessionFile: accepts raw Playwright format (no version)', () => {
  const raw = {
    cookies: [{ name: 'a', value: 'b' }],
    origins: [{ origin: 'https://x.test', localStorage: [] }],
  };
  const r = parseSessionFile(raw);
  assert.equal(r.cookies.length, 1);
  assert.equal(r.origins.length, 1);
  assert.equal(r.profile,  '');
  assert.equal(r.savedAt, null);
});

test('parseSessionFile: null input throws', () => {
  assert.throws(() => parseSessionFile(null),   /not an object/i);
  assert.throws(() => parseSessionFile('{}'),   /not an object/i);
});

test('parseSessionFile: unsupported version throws', () => {
  assert.throws(() => parseSessionFile({ version: 99, cookies: [] }), /unsupported/i);
});

test('parseSessionFile: missing cookies throws', () => {
  assert.throws(() => parseSessionFile({ version: SESSION_VERSION }), /must be an array/i);
});

test('parseSessionFile: non-array cookies throws', () => {
  assert.throws(() => parseSessionFile({ cookies: 'bad' }), /must be an array/i);
});

test('parseSessionFile: missing origins defaults to []', () => {
  const r = parseSessionFile({ version: SESSION_VERSION, cookies: [] });
  assert.deepEqual(r.origins, []);
});

// ── filterExpiredCookies ──────────────────────────────────────────────────────

test('filterExpiredCookies: keeps cookies without expires field', () => {
  const cookies = [{ name: 'a', value: '1' }];
  assert.equal(filterExpiredCookies(cookies).length, 1);
});

test('filterExpiredCookies: keeps cookies with expires=-1 (session cookie)', () => {
  const cookies = [{ name: 'a', value: '1', expires: -1 }];
  assert.equal(filterExpiredCookies(cookies).length, 1);
});

test('filterExpiredCookies: removes expired cookies (expires in past)', () => {
  const past = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
  const cookies = [{ name: 'a', value: '1', expires: past }];
  assert.equal(filterExpiredCookies(cookies).length, 0);
});

test('filterExpiredCookies: keeps future-dated cookies', () => {
  const future = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
  const cookies = [{ name: 'a', value: '1', expires: future }];
  assert.equal(filterExpiredCookies(cookies).length, 1);
});

test('filterExpiredCookies: mixed — removes expired, keeps valid', () => {
  const past   = Math.floor(Date.now() / 1000) - 1;
  const future = Math.floor(Date.now() / 1000) + 3600;
  const cookies = [
    { name: 'a', expires: past },
    { name: 'b', expires: future },
    { name: 'c' }, // no expires
  ];
  const kept = filterExpiredCookies(cookies);
  assert.equal(kept.length, 2);
  const names = kept.map((c) => c.name).sort();
  assert.deepEqual(names, ['b', 'c']);
});

test('filterExpiredCookies: accepts custom "now" date', () => {
  const ts      = 1_000_000; // epoch seconds
  const cookies = [
    { name: 'a', expires: 999_999 }, // before ts
    { name: 'b', expires: 1_000_001 }, // after ts
  ];
  const kept = filterExpiredCookies(cookies, new Date(ts * 1000));
  assert.equal(kept.length, 1);
  assert.equal(kept[0].name, 'b');
});
