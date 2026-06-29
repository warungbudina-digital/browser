import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NetworkThrottleManager } from '../src/browser/NetworkThrottleManager.js';

// ── presets ───────────────────────────────────────────────────────────────────

test('presets: returns array of strings', () => {
  const mgr = new NetworkThrottleManager();
  const p   = mgr.presets();
  assert.ok(Array.isArray(p));
  assert.ok(p.every((x) => typeof x === 'string'));
});

test('presets: includes known profiles', () => {
  const mgr = new NetworkThrottleManager();
  const p   = mgr.presets();
  for (const name of ['offline', 'slow-3g', 'fast-3g', '4g', 'wifi', 'cable', 'dsl']) {
    assert.ok(p.includes(name), `missing preset: ${name}`);
  }
});

test('presets: has exactly 7 built-in entries', () => {
  assert.equal(new NetworkThrottleManager().presets().length, 7);
});

// ── list ──────────────────────────────────────────────────────────────────────

test('list: returns a Map', () => {
  assert.ok(new NetworkThrottleManager().list() instanceof Map);
});

test('list: preset entries have type "preset"', () => {
  const mgr  = new NetworkThrottleManager();
  for (const [, spec] of mgr.list()) assert.equal(spec.type, 'preset');
});

test('list: custom entries appear with type "custom"', () => {
  const mgr = new NetworkThrottleManager();
  mgr.add('My Profile', { downloadThroughput: 100000, uploadThroughput: 50000 });
  const list = mgr.list();
  assert.ok(list.has('My Profile'));
  assert.equal(list.get('My Profile').type, 'custom');
});

// ── get ───────────────────────────────────────────────────────────────────────

test('get: returns spec for preset with required fields', () => {
  const spec = new NetworkThrottleManager().get('wifi');
  assert.ok(spec != null);
  assert.ok(typeof spec.downloadThroughput === 'number');
  assert.ok(typeof spec.uploadThroughput   === 'number');
  assert.ok(typeof spec.latency            === 'number');
  assert.ok(typeof spec.offline            === 'boolean');
});

test('get: offline preset has offline: true', () => {
  assert.equal(new NetworkThrottleManager().get('offline').offline, true);
});

test('get: non-offline presets have offline: false', () => {
  const mgr = new NetworkThrottleManager();
  for (const name of ['slow-3g', 'fast-3g', '4g', 'wifi', 'cable', 'dsl']) {
    assert.equal(mgr.get(name).offline, false);
  }
});

test('get: returns null for unknown name', () => {
  assert.equal(new NetworkThrottleManager().get('dialup'), null);
});

test('get: returns a copy — mutation does not affect emulator', () => {
  const mgr  = new NetworkThrottleManager();
  const spec = mgr.get('wifi');
  spec.downloadThroughput = 1;
  assert.notEqual(mgr.get('wifi').downloadThroughput, 1);
});

// ── resolve ───────────────────────────────────────────────────────────────────

test('resolve: returns spec for known preset', () => {
  assert.ok(new NetworkThrottleManager().resolve('4g') != null);
});

test('resolve: throws for unknown name', () => {
  assert.throws(
    () => new NetworkThrottleManager().resolve('pigeon-net'),
    /Unknown throttle profile/,
  );
});

// ── add ───────────────────────────────────────────────────────────────────────

test('add: stores custom profile and get returns it', () => {
  const mgr  = new NetworkThrottleManager();
  mgr.add('Custom', { downloadThroughput: 200000, uploadThroughput: 100000, latency: 50 });
  const spec = mgr.get('Custom');
  assert.equal(spec.downloadThroughput, 200000);
  assert.equal(spec.uploadThroughput,   100000);
  assert.equal(spec.latency,            50);
});

test('add: defaults latency to 0', () => {
  const mgr  = new NetworkThrottleManager();
  const spec = mgr.add('NoLatency', { downloadThroughput: 1000, uploadThroughput: 500 });
  assert.equal(spec.latency, 0);
});

test('add: defaults offline to false', () => {
  const mgr  = new NetworkThrottleManager();
  const spec = mgr.add('NoOffline', { downloadThroughput: 1000, uploadThroughput: 500 });
  assert.equal(spec.offline, false);
});

test('add: throws when name is null', () => {
  assert.throws(
    () => new NetworkThrottleManager().add(null, { downloadThroughput: 0, uploadThroughput: 0 }),
    /required/,
  );
});

test('add: throws when name is blank', () => {
  assert.throws(
    () => new NetworkThrottleManager().add('   ', { downloadThroughput: 0, uploadThroughput: 0 }),
    /blank/,
  );
});

test('add: throws when trying to override a preset', () => {
  assert.throws(
    () => new NetworkThrottleManager().add('wifi', { downloadThroughput: 0, uploadThroughput: 0 }),
    /Cannot override preset/,
  );
});

test('add: throws for missing downloadThroughput', () => {
  assert.throws(
    () => new NetworkThrottleManager().add('X', { uploadThroughput: 0 }),
    /downloadThroughput/,
  );
});

test('add: throws for missing uploadThroughput', () => {
  assert.throws(
    () => new NetworkThrottleManager().add('X', { downloadThroughput: 0 }),
    /uploadThroughput/,
  );
});

test('add: throws for negative downloadThroughput', () => {
  assert.throws(
    () => new NetworkThrottleManager().add('X', { downloadThroughput: -1, uploadThroughput: 0 }),
    /downloadThroughput/,
  );
});

test('add: throws for negative uploadThroughput', () => {
  assert.throws(
    () => new NetworkThrottleManager().add('X', { downloadThroughput: 0, uploadThroughput: -1 }),
    /uploadThroughput/,
  );
});

test('add: throws for negative latency', () => {
  assert.throws(
    () => new NetworkThrottleManager().add('X', { downloadThroughput: 0, uploadThroughput: 0, latency: -1 }),
    /latency/,
  );
});

// ── remove ────────────────────────────────────────────────────────────────────

test('remove: removes a custom profile and returns true', () => {
  const mgr = new NetworkThrottleManager();
  mgr.add('Temp', { downloadThroughput: 0, uploadThroughput: 0 });
  assert.equal(mgr.remove('Temp'), true);
  assert.equal(mgr.get('Temp'), null);
});

test('remove: returns false for non-existent name', () => {
  assert.equal(new NetworkThrottleManager().remove('Ghost'), false);
});

test('remove: throws for preset names', () => {
  assert.throws(
    () => new NetworkThrottleManager().remove('slow-3g'),
    /Cannot remove preset/,
  );
});

// ── validateSpec ──────────────────────────────────────────────────────────────

test('validateSpec: valid spec returns normalized object', () => {
  const mgr  = new NetworkThrottleManager();
  const spec = mgr.validateSpec({ downloadThroughput: 500000, uploadThroughput: 250000, latency: 10 });
  assert.equal(spec.downloadThroughput, 500000);
  assert.equal(spec.uploadThroughput,   250000);
  assert.equal(spec.latency, 10);
  assert.equal(spec.offline, false);
});

test('validateSpec: defaults latency to 0 and offline to false', () => {
  const spec = new NetworkThrottleManager().validateSpec({ downloadThroughput: 1000, uploadThroughput: 1000 });
  assert.equal(spec.latency,  0);
  assert.equal(spec.offline, false);
});

test('validateSpec: throws when downloadThroughput missing', () => {
  assert.throws(
    () => new NetworkThrottleManager().validateSpec({ uploadThroughput: 0 }),
    /downloadThroughput/,
  );
});

test('validateSpec: throws for negative values', () => {
  assert.throws(
    () => new NetworkThrottleManager().validateSpec({ downloadThroughput: -1, uploadThroughput: 0 }),
    /downloadThroughput/,
  );
});

// ── presets() excludes custom ─────────────────────────────────────────────────

test('presets() does not include custom entries', () => {
  const mgr = new NetworkThrottleManager();
  mgr.add('Hidden', { downloadThroughput: 100, uploadThroughput: 100 });
  assert.ok(!mgr.presets().includes('Hidden'));
});

// ── source checks ─────────────────────────────────────────────────────────────

test('BrowserService source imports NetworkThrottleManager', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('NetworkThrottleManager'), 'NetworkThrottleManager import missing');
});

test('BrowserService source includes throttleSet method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('throttleSet'), 'throttleSet method missing');
});

test('BrowserService source includes networkThrottle instance', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('networkThrottle'), 'networkThrottle instance missing');
});

test('BrowserManager source includes throttle-set dispatch', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes("case 'throttle-set'"), 'throttle-set dispatch missing');
});

test('BrowserManager source includes throttleActions in capabilities', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes('throttleActions'), 'throttleActions missing from capabilities');
});
