import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { InitScriptManager } from '../src/browser/InitScriptManager.js';

// ── add ───────────────────────────────────────────────────────────────────────

test('add: returns id and name', () => {
  const mgr   = new InitScriptManager();
  const entry = mgr.add({ name: 'mock-date', script: 'Date.now = () => 0;' });
  assert.ok(typeof entry.id === 'number');
  assert.equal(entry.name, 'mock-date');
  assert.ok(!Object.prototype.hasOwnProperty.call(entry, 'script'), 'script body must not be returned by add');
});

test('add: assigns auto-incrementing ids', () => {
  const mgr = new InitScriptManager();
  const r1  = mgr.add({ name: 'a', script: 'void 0;' });
  const r2  = mgr.add({ name: 'b', script: 'void 0;' });
  assert.ok(r2.id > r1.id);
});

test('add: trims name', () => {
  const mgr   = new InitScriptManager();
  const entry = mgr.add({ name: '  polyfill  ', script: 'void 0;' });
  assert.equal(entry.name, 'polyfill');
});

test('add: throws for blank name', () => {
  assert.throws(() => new InitScriptManager().add({ name: '', script: 'void 0;' }), /name/);
});

test('add: throws for non-string name', () => {
  assert.throws(() => new InitScriptManager().add({ name: null, script: 'void 0;' }), /name/);
});

test('add: throws for blank script', () => {
  assert.throws(() => new InitScriptManager().add({ name: 'x', script: '   ' }), /script/);
});

test('add: throws for non-string script', () => {
  assert.throws(() => new InitScriptManager().add({ name: 'x', script: 42 }), /script/);
});

// ── remove ────────────────────────────────────────────────────────────────────

test('remove: returns true and removes entry', () => {
  const mgr   = new InitScriptManager();
  const entry = mgr.add({ name: 'x', script: 'void 0;' });
  assert.equal(mgr.remove(entry.id), true);
  assert.equal(mgr.size, 0);
});

test('remove: returns false for non-existent id', () => {
  assert.equal(new InitScriptManager().remove(999), false);
});

// ── get ───────────────────────────────────────────────────────────────────────

test('get: returns full entry including script body', () => {
  const mgr   = new InitScriptManager();
  const entry = mgr.add({ name: 'tracer', script: 'console.log("x");' });
  const found = mgr.get(entry.id);
  assert.equal(found.id,     entry.id);
  assert.equal(found.name,   'tracer');
  assert.equal(found.script, 'console.log("x");');
});

test('get: returns null for non-existent id', () => {
  assert.equal(new InitScriptManager().get(999), null);
});

// ── list ──────────────────────────────────────────────────────────────────────

test('list: returns id and name only, not script body', () => {
  const mgr = new InitScriptManager();
  mgr.add({ name: 'a', script: 'void 0;' });
  const items = mgr.list();
  assert.equal(items.length, 1);
  assert.ok(Object.prototype.hasOwnProperty.call(items[0], 'id'));
  assert.ok(Object.prototype.hasOwnProperty.call(items[0], 'name'));
  assert.ok(!Object.prototype.hasOwnProperty.call(items[0], 'script'), 'script body must not appear in list()');
});

test('list: returns empty array initially', () => {
  assert.deepEqual(new InitScriptManager().list(), []);
});

test('list: returns all entries', () => {
  const mgr = new InitScriptManager();
  mgr.add({ name: 'a', script: 'void 0;' });
  mgr.add({ name: 'b', script: 'void 0;' });
  assert.equal(mgr.list().length, 2);
});

// ── allScripts ────────────────────────────────────────────────────────────────

test('allScripts: includes script body', () => {
  const mgr = new InitScriptManager();
  mgr.add({ name: 'x', script: 'window.__test = 1;' });
  const all = mgr.allScripts();
  assert.equal(all.length, 1);
  assert.equal(all[0].script, 'window.__test = 1;');
});

test('allScripts: returns all three fields', () => {
  const mgr   = new InitScriptManager();
  const entry = mgr.add({ name: 'y', script: 'void 0;' });
  const [s]   = mgr.allScripts();
  assert.equal(s.id,   entry.id);
  assert.equal(s.name, 'y');
  assert.ok(typeof s.script === 'string');
});

// ── clear ─────────────────────────────────────────────────────────────────────

test('clear: removes all entries', () => {
  const mgr = new InitScriptManager();
  mgr.add({ name: 'a', script: 'void 0;' });
  mgr.add({ name: 'b', script: 'void 0;' });
  mgr.clear();
  assert.equal(mgr.size, 0);
  assert.deepEqual(mgr.list(), []);
});

// ── size ──────────────────────────────────────────────────────────────────────

test('size: 0 initially', () => {
  assert.equal(new InitScriptManager().size, 0);
});

test('size: increments on add', () => {
  const mgr = new InitScriptManager();
  mgr.add({ name: 'a', script: 'void 0;' });
  assert.equal(mgr.size, 1);
  mgr.add({ name: 'b', script: 'void 0;' });
  assert.equal(mgr.size, 2);
});

test('size: decrements on remove', () => {
  const mgr   = new InitScriptManager();
  const entry = mgr.add({ name: 'a', script: 'void 0;' });
  mgr.remove(entry.id);
  assert.equal(mgr.size, 0);
});

// ── source checks ─────────────────────────────────────────────────────────────

test('BrowserService imports InitScriptManager', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('InitScriptManager'), 'InitScriptManager import missing');
});

test('BrowserService includes initScriptManager instance', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('initScriptManager'), 'initScriptManager instance missing');
});

test('BrowserService includes initAdd method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('initAdd'), 'initAdd missing');
});

test('BrowserService includes initRun method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('initRun'), 'initRun missing');
});

test('BrowserService initAdd calls page.addInitScript', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('addInitScript'), 'addInitScript call missing');
});

test('BrowserManager includes init-add dispatch', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes("case 'init-add'"), 'init-add dispatch missing');
});

test('BrowserManager includes initActions in capabilities', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes('initActions'), 'initActions missing from capabilities');
});
