import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BasicAuthManager, encodeCredentials } from '../src/browser/BasicAuthManager.js';

// ── encodeCredentials ─────────────────────────────────────────────────────────

test('encodeCredentials: produces correct base64', () => {
  const token = encodeCredentials('user', 'pass');
  assert.equal(token, Buffer.from('user:pass').toString('base64'));
});

test('encodeCredentials: handles empty password', () => {
  const token = encodeCredentials('admin', '');
  assert.equal(token, Buffer.from('admin:').toString('base64'));
});

test('encodeCredentials: handles special characters', () => {
  const token = encodeCredentials('u@example.com', 'p@$$w0rd!');
  assert.equal(token, Buffer.from('u@example.com:p@$$w0rd!').toString('base64'));
});

// ── add ───────────────────────────────────────────────────────────────────────

test('add: returns entry with id, pattern, username (no password)', () => {
  const mgr   = new BasicAuthManager();
  const entry = mgr.add({ pattern: '**', username: 'alice', password: 'secret' });
  assert.ok(typeof entry.id === 'number');
  assert.equal(entry.pattern,  '**');
  assert.equal(entry.username, 'alice');
  assert.ok(!Object.prototype.hasOwnProperty.call(entry, 'password'), 'password must not be returned');
  assert.ok(!Object.prototype.hasOwnProperty.call(entry, 'token'),    'token must not be returned');
});

test('add: assigns auto-incrementing ids', () => {
  const mgr = new BasicAuthManager();
  const r1  = mgr.add({ pattern: 'a', username: 'u1', password: 'p1' });
  const r2  = mgr.add({ pattern: 'b', username: 'u2', password: 'p2' });
  assert.ok(r2.id > r1.id);
});

test('add: throws for null pattern', () => {
  assert.throws(() => new BasicAuthManager().add({ pattern: null, username: 'u', password: 'p' }), /pattern/);
});

test('add: throws for blank username', () => {
  assert.throws(() => new BasicAuthManager().add({ pattern: '**', username: '', password: 'p' }), /username/);
});

test('add: throws for non-string username', () => {
  assert.throws(() => new BasicAuthManager().add({ pattern: '**', username: 123, password: 'p' }), /username/);
});

test('add: throws for non-string password', () => {
  assert.throws(() => new BasicAuthManager().add({ pattern: '**', username: 'u', password: null }), /password/);
});

test('add: accepts empty string password', () => {
  const entry = new BasicAuthManager().add({ pattern: '**', username: 'u', password: '' });
  assert.equal(entry.username, 'u');
});

// ── remove ────────────────────────────────────────────────────────────────────

test('remove: returns true and removes credential', () => {
  const mgr   = new BasicAuthManager();
  const entry = mgr.add({ pattern: '**', username: 'u', password: 'p' });
  assert.equal(mgr.remove(entry.id), true);
  assert.equal(mgr.size, 0);
});

test('remove: returns false for non-existent id', () => {
  assert.equal(new BasicAuthManager().remove(999), false);
});

// ── match ─────────────────────────────────────────────────────────────────────

test('match: returns username and token for matching URL', () => {
  const mgr = new BasicAuthManager();
  mgr.add({ pattern: 'https://api.example.com/**', username: 'user', password: 'pass' });
  const result = mgr.match('https://api.example.com/data');
  assert.ok(result != null);
  assert.equal(result.username, 'user');
  assert.equal(result.token,    encodeCredentials('user', 'pass'));
});

test('match: returns null for non-matching URL', () => {
  const mgr = new BasicAuthManager();
  mgr.add({ pattern: 'https://api.example.com/**', username: 'u', password: 'p' });
  assert.equal(mgr.match('https://other.com/'), null);
});

test('match: returns first matching entry', () => {
  const mgr = new BasicAuthManager();
  mgr.add({ pattern: '**', username: 'first',  password: 'p1' });
  mgr.add({ pattern: '**', username: 'second', password: 'p2' });
  assert.equal(mgr.match('https://any.com').username, 'first');
});

test('match: supports RegExp pattern', () => {
  const mgr = new BasicAuthManager();
  mgr.add({ pattern: /example\.com/, username: 'rex', password: 'p' });
  assert.ok(mgr.match('https://api.example.com/') != null);
  assert.equal(mgr.match('https://other.com/'), null);
});

test('match: token does not expose password', () => {
  const mgr    = new BasicAuthManager();
  mgr.add({ pattern: '**', username: 'u', password: 'secret' });
  const result = mgr.match('https://any.com');
  assert.ok(!Object.prototype.hasOwnProperty.call(result, 'password'));
});

// ── list ──────────────────────────────────────────────────────────────────────

test('list: returns all entries without passwords or tokens', () => {
  const mgr = new BasicAuthManager();
  mgr.add({ pattern: 'a/**', username: 'alice', password: 'pa' });
  mgr.add({ pattern: 'b/**', username: 'bob',   password: 'pb' });
  const items = mgr.list();
  assert.equal(items.length, 2);
  for (const item of items) {
    assert.ok(!Object.prototype.hasOwnProperty.call(item, 'password'));
    assert.ok(!Object.prototype.hasOwnProperty.call(item, 'token'));
    assert.ok(typeof item.id       === 'number');
    assert.ok(typeof item.username === 'string');
  }
});

test('list: returns empty array initially', () => {
  assert.deepEqual(new BasicAuthManager().list(), []);
});

// ── clear ─────────────────────────────────────────────────────────────────────

test('clear: removes all credentials', () => {
  const mgr = new BasicAuthManager();
  mgr.add({ pattern: 'a', username: 'u1', password: 'p1' });
  mgr.add({ pattern: 'b', username: 'u2', password: 'p2' });
  mgr.clear();
  assert.equal(mgr.size, 0);
  assert.deepEqual(mgr.list(), []);
});

// ── size ──────────────────────────────────────────────────────────────────────

test('size: 0 initially', () => {
  assert.equal(new BasicAuthManager().size, 0);
});

test('size: increments on add', () => {
  const mgr = new BasicAuthManager();
  mgr.add({ pattern: '**', username: 'u', password: 'p' });
  assert.equal(mgr.size, 1);
});

test('size: decrements on remove', () => {
  const mgr   = new BasicAuthManager();
  const entry = mgr.add({ pattern: '**', username: 'u', password: 'p' });
  mgr.remove(entry.id);
  assert.equal(mgr.size, 0);
});

// ── source checks ─────────────────────────────────────────────────────────────

test('BrowserService imports BasicAuthManager', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('BasicAuthManager'), 'BasicAuthManager import missing');
});

test('BrowserService includes basicAuthManager instance', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('basicAuthManager'), 'basicAuthManager instance missing');
});

test('BrowserService route handler uses basicAuthManager.match', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('basicAuthManager.match'), 'basicAuthManager.match missing from route handler');
});

test('BrowserService includes authAdd method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('authAdd'), 'authAdd missing');
});

test('BrowserService includes authClear method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('authClear'), 'authClear missing');
});

test('BrowserManager includes auth-add dispatch', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes("case 'auth-add'"), 'auth-add dispatch missing');
});

test('BrowserManager includes authActions in capabilities', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes('authActions'), 'authActions missing from capabilities');
});
