import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ViewportManager, BUILTIN_VIEWPORTS } from '../src/browser/ViewportManager.js';

// ── BUILTIN_VIEWPORTS ─────────────────────────────────────────────────────────

test('BUILTIN_VIEWPORTS has expected presets', () => {
  const names = Object.keys(BUILTIN_VIEWPORTS);
  for (const n of ['mobile-s', 'mobile-m', 'mobile-l', 'tablet', 'laptop', 'laptop-l', '2k', '4k']) {
    assert.ok(names.includes(n), `missing builtin: ${n}`);
  }
});

test('BUILTIN_VIEWPORTS entries have positive integer width and height', () => {
  for (const [name, spec] of Object.entries(BUILTIN_VIEWPORTS)) {
    assert.ok(Number.isInteger(spec.width)  && spec.width  > 0, `${name}.width invalid`);
    assert.ok(Number.isInteger(spec.height) && spec.height > 0, `${name}.height invalid`);
  }
});

// ── list ──────────────────────────────────────────────────────────────────────

test('list: includes all builtins', () => {
  const mgr   = new ViewportManager();
  const names = mgr.list().map((v) => v.name);
  for (const n of Object.keys(BUILTIN_VIEWPORTS)) {
    assert.ok(names.includes(n), `missing builtin in list: ${n}`);
  }
});

test('list: builtin entries have builtin:true', () => {
  const mgr = new ViewportManager();
  for (const entry of mgr.list()) {
    if (Object.prototype.hasOwnProperty.call(BUILTIN_VIEWPORTS, entry.name)) {
      assert.equal(entry.builtin, true);
    }
  }
});

test('list: custom entries have builtin:false', () => {
  const mgr = new ViewportManager();
  mgr.add('custom-hd', { width: 1920, height: 1080 });
  const entry = mgr.list().find((v) => v.name === 'custom-hd');
  assert.equal(entry.builtin, false);
});

// ── add ───────────────────────────────────────────────────────────────────────

test('add: returns spec with name and builtin:false', () => {
  const mgr    = new ViewportManager();
  const result = mgr.add('wide', { width: 1920, height: 1080 });
  assert.equal(result.name,    'wide');
  assert.equal(result.width,   1920);
  assert.equal(result.height,  1080);
  assert.equal(result.builtin, false);
});

test('add: throws for blank name', () => {
  assert.throws(() => new ViewportManager().add('', { width: 800, height: 600 }), /name/);
});

test('add: throws for non-string name', () => {
  assert.throws(() => new ViewportManager().add(null, { width: 800, height: 600 }), /name/);
});

test('add: throws for builtin override', () => {
  assert.throws(() => new ViewportManager().add('laptop', { width: 800, height: 600 }), /builtin/);
});

test('add: throws for duplicate custom name', () => {
  const mgr = new ViewportManager();
  mgr.add('my-view', { width: 800, height: 600 });
  assert.throws(() => mgr.add('my-view', { width: 1024, height: 768 }), /exists/);
});

test('add: throws for non-integer width', () => {
  assert.throws(() => new ViewportManager().add('bad', { width: 800.5, height: 600 }), /width/);
});

test('add: throws for zero width', () => {
  assert.throws(() => new ViewportManager().add('bad', { width: 0, height: 600 }), /width/);
});

test('add: throws for non-integer height', () => {
  assert.throws(() => new ViewportManager().add('bad', { width: 800, height: 'tall' }), /height/);
});

test('add: throws for null spec', () => {
  assert.throws(() => new ViewportManager().add('bad', null), /spec/);
});

// ── remove ────────────────────────────────────────────────────────────────────

test('remove: returns true and removes custom preset', () => {
  const mgr = new ViewportManager();
  mgr.add('temp', { width: 640, height: 480 });
  assert.equal(mgr.remove('temp'), true);
  assert.equal(mgr.get('temp'), null);
});

test('remove: returns false for non-existent name', () => {
  assert.equal(new ViewportManager().remove('nonexistent'), false);
});

test('remove: throws for builtin name', () => {
  assert.throws(() => new ViewportManager().remove('laptop'), /builtin/);
});

// ── get ───────────────────────────────────────────────────────────────────────

test('get: returns builtin spec', () => {
  const spec = new ViewportManager().get('laptop');
  assert.equal(spec.width,  BUILTIN_VIEWPORTS['laptop'].width);
  assert.equal(spec.height, BUILTIN_VIEWPORTS['laptop'].height);
});

test('get: returns custom spec', () => {
  const mgr = new ViewportManager();
  mgr.add('custom', { width: 1366, height: 768 });
  const spec = mgr.get('custom');
  assert.equal(spec.width,  1366);
  assert.equal(spec.height, 768);
});

test('get: returns null for unknown name', () => {
  assert.equal(new ViewportManager().get('unknown'), null);
});

test('get: returns copy — mutation does not affect stored spec', () => {
  const mgr  = new ViewportManager();
  mgr.add('clone-test', { width: 800, height: 600 });
  const spec = mgr.get('clone-test');
  spec.width = 9999;
  assert.equal(mgr.get('clone-test').width, 800);
});

// ── resolve ───────────────────────────────────────────────────────────────────

test('resolve: accepts preset name string', () => {
  const spec = new ViewportManager().resolve('tablet');
  assert.equal(spec.width,  BUILTIN_VIEWPORTS['tablet'].width);
  assert.equal(spec.height, BUILTIN_VIEWPORTS['tablet'].height);
});

test('resolve: accepts inline spec object', () => {
  const spec = new ViewportManager().resolve({ width: 1024, height: 768 });
  assert.equal(spec.width,  1024);
  assert.equal(spec.height, 768);
});

test('resolve: throws for unknown preset name', () => {
  assert.throws(() => new ViewportManager().resolve('nonexistent'), /Unknown viewport preset/);
});

test('resolve: throws for invalid inline spec', () => {
  assert.throws(() => new ViewportManager().resolve({ width: -1, height: 600 }), /width/);
});

// ── size ──────────────────────────────────────────────────────────────────────

test('size: equals builtin count initially', () => {
  const mgr = new ViewportManager();
  assert.equal(mgr.size, Object.keys(BUILTIN_VIEWPORTS).length);
});

test('size: increments when custom preset added', () => {
  const mgr    = new ViewportManager();
  const before = mgr.size;
  mgr.add('extra', { width: 800, height: 600 });
  assert.equal(mgr.size, before + 1);
});

test('size: decrements when custom preset removed', () => {
  const mgr = new ViewportManager();
  mgr.add('extra', { width: 800, height: 600 });
  const before = mgr.size;
  mgr.remove('extra');
  assert.equal(mgr.size, before - 1);
});

// ── source checks ─────────────────────────────────────────────────────────────

test('BrowserService imports ViewportManager', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('ViewportManager'), 'ViewportManager import missing');
});

test('BrowserService includes viewportManager instance', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('viewportManager'), 'viewportManager instance missing');
});

test('BrowserService includes viewportList method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('viewportList'), 'viewportList method missing');
});

test('BrowserService includes viewportSet method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('viewportSet'), 'viewportSet method missing');
});

test('BrowserService includes viewportReset method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('viewportReset'), 'viewportReset method missing');
});

test('BrowserManager includes viewport-list dispatch', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes("case 'viewport-list'"), 'viewport-list dispatch missing');
});

test('BrowserManager includes viewportActions in capabilities', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes('viewportActions'), 'viewportActions missing from capabilities');
});
