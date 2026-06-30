import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CSSOverrideManager, styleElementId } from '../src/browser/CSSOverrideManager.js';

// ── styleElementId ────────────────────────────────────────────────────────────

test('styleElementId: returns correct element id string', () => {
  assert.equal(styleElementId(1),  'css-override-1');
  assert.equal(styleElementId(42), 'css-override-42');
});

// ── add ───────────────────────────────────────────────────────────────────────

test('add: returns id and name (no css body)', () => {
  const mgr  = new CSSOverrideManager();
  const rule = mgr.add({ name: 'dark', css: 'body { background: #000; }' });
  assert.equal(rule.id,   1);
  assert.equal(rule.name, 'dark');
  assert.ok(!('css' in rule), 'css body must not be returned from add()');
});

test('add: increments id', () => {
  const mgr = new CSSOverrideManager();
  mgr.add({ name: 'a', css: 'a{}' });
  const r2 = mgr.add({ name: 'b', css: 'b{}' });
  assert.equal(r2.id, 2);
});

test('add: trims name', () => {
  const mgr  = new CSSOverrideManager();
  const rule = mgr.add({ name: '  dark  ', css: 'body{}' });
  assert.equal(rule.name, 'dark');
});

test('add: throws for empty name', () => {
  assert.throws(() => new CSSOverrideManager().add({ name: '', css: 'body{}' }), /name/);
});

test('add: throws for whitespace-only name', () => {
  assert.throws(() => new CSSOverrideManager().add({ name: '   ', css: 'body{}' }), /name/);
});

test('add: throws for missing name', () => {
  assert.throws(() => new CSSOverrideManager().add({ css: 'body{}' }), /name/);
});

test('add: throws for empty css', () => {
  assert.throws(() => new CSSOverrideManager().add({ name: 'x', css: '' }), /css/);
});

test('add: throws for whitespace-only css', () => {
  assert.throws(() => new CSSOverrideManager().add({ name: 'x', css: '   ' }), /css/);
});

test('add: throws for missing css', () => {
  assert.throws(() => new CSSOverrideManager().add({ name: 'x' }), /css/);
});

// ── remove ────────────────────────────────────────────────────────────────────

test('remove: returns true when rule exists', () => {
  const mgr  = new CSSOverrideManager();
  const rule = mgr.add({ name: 'x', css: 'x{}' });
  assert.equal(mgr.remove(rule.id), true);
});

test('remove: returns false when rule does not exist', () => {
  assert.equal(new CSSOverrideManager().remove(999), false);
});

test('remove: reduces size', () => {
  const mgr = new CSSOverrideManager();
  const r   = mgr.add({ name: 'x', css: 'x{}' });
  mgr.add({ name: 'y', css: 'y{}' });
  mgr.remove(r.id);
  assert.equal(mgr.size, 1);
});

// ── get ───────────────────────────────────────────────────────────────────────

test('get: returns full rule including css', () => {
  const mgr  = new CSSOverrideManager();
  const rule = mgr.add({ name: 'dark', css: 'body{color:red}' });
  const got  = mgr.get(rule.id);
  assert.equal(got.id,   rule.id);
  assert.equal(got.name, 'dark');
  assert.equal(got.css,  'body{color:red}');
});

test('get: returns null for missing id', () => {
  assert.equal(new CSSOverrideManager().get(999), null);
});

test('get: returns null after remove', () => {
  const mgr  = new CSSOverrideManager();
  const rule = mgr.add({ name: 'x', css: 'x{}' });
  mgr.remove(rule.id);
  assert.equal(mgr.get(rule.id), null);
});

// ── list ──────────────────────────────────────────────────────────────────────

test('list: returns empty array initially', () => {
  assert.deepEqual(new CSSOverrideManager().list(), []);
});

test('list: returns id and name only (no css)', () => {
  const mgr = new CSSOverrideManager();
  mgr.add({ name: 'dark', css: 'body{background:#000}' });
  const list = mgr.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'dark');
  assert.ok(!('css' in list[0]), 'css must not appear in list()');
});

test('list: multiple rules in insertion order', () => {
  const mgr = new CSSOverrideManager();
  mgr.add({ name: 'a', css: 'a{}' });
  mgr.add({ name: 'b', css: 'b{}' });
  const list = mgr.list();
  assert.equal(list[0].name, 'a');
  assert.equal(list[1].name, 'b');
});

// ── allRules ──────────────────────────────────────────────────────────────────

test('allRules: includes css body', () => {
  const mgr = new CSSOverrideManager();
  mgr.add({ name: 'x', css: 'x{color:red}' });
  const all = mgr.allRules();
  assert.ok('css' in all[0]);
  assert.equal(all[0].css, 'x{color:red}');
});

// ── combined ──────────────────────────────────────────────────────────────────

test('combined: empty string when no rules', () => {
  assert.equal(new CSSOverrideManager().combined(), '');
});

test('combined: merges all rules with name comments', () => {
  const mgr = new CSSOverrideManager();
  mgr.add({ name: 'dark', css: 'body{color:#fff}' });
  mgr.add({ name: 'big',  css: 'p{font-size:2rem}' });
  const out = mgr.combined();
  assert.ok(out.includes('/* dark */'));
  assert.ok(out.includes('/* big */'));
  assert.ok(out.includes('body{color:#fff}'));
  assert.ok(out.includes('p{font-size:2rem}'));
});

// ── clear / size ──────────────────────────────────────────────────────────────

test('clear: removes all rules', () => {
  const mgr = new CSSOverrideManager();
  mgr.add({ name: 'a', css: 'a{}' });
  mgr.add({ name: 'b', css: 'b{}' });
  mgr.clear();
  assert.equal(mgr.size, 0);
  assert.deepEqual(mgr.list(), []);
});

test('size: 0 initially', () => {
  assert.equal(new CSSOverrideManager().size, 0);
});

test('size: increments on add', () => {
  const mgr = new CSSOverrideManager();
  mgr.add({ name: 'a', css: 'a{}' });
  assert.equal(mgr.size, 1);
  mgr.add({ name: 'b', css: 'b{}' });
  assert.equal(mgr.size, 2);
});

// ── source checks ─────────────────────────────────────────────────────────────

test('BrowserService imports CSSOverrideManager', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('CSSOverrideManager'), 'CSSOverrideManager import missing');
});

test('BrowserService includes cssOverrideManager instance', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('cssOverrideManager'), 'cssOverrideManager instance missing');
});

test('BrowserService includes cssAdd method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('async cssAdd'), 'cssAdd missing');
});

test('BrowserService includes cssRemove method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('async cssRemove'), 'cssRemove missing');
});

test('BrowserService includes cssClear method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('async cssClear'), 'cssClear missing');
});

test('BrowserService includes cssInject method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('async cssInject'), 'cssInject missing');
});

test('BrowserManager includes css-add dispatch', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes("case 'css-add'"), 'css-add dispatch missing');
});

test('BrowserManager includes cssActions in capabilities', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes('cssActions'), 'cssActions missing from capabilities');
});
