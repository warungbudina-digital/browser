import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GeolocationEmulator } from '../src/browser/GeolocationEmulator.js';

// ── presets ───────────────────────────────────────────────────────────────────

test('presets: returns array of strings', () => {
  const geo = new GeolocationEmulator();
  const p   = geo.presets();
  assert.ok(Array.isArray(p));
  assert.ok(p.length > 0);
  assert.ok(p.every((x) => typeof x === 'string'));
});

test('presets: includes known cities', () => {
  const geo = new GeolocationEmulator();
  const p   = geo.presets();
  for (const city of ['New York', 'London', 'Tokyo', 'Jakarta', 'Singapore']) {
    assert.ok(p.includes(city), `missing preset: ${city}`);
  }
});

test('presets: has exactly 10 built-in entries', () => {
  assert.equal(new GeolocationEmulator().presets().length, 10);
});

// ── list ──────────────────────────────────────────────────────────────────────

test('list: returns a Map', () => {
  assert.ok(new GeolocationEmulator().list() instanceof Map);
});

test('list: preset entries have type "preset"', () => {
  const geo  = new GeolocationEmulator();
  const list = geo.list();
  for (const [, spec] of list) {
    assert.equal(spec.type, 'preset');
  }
});

test('list: custom entries appear with type "custom"', () => {
  const geo = new GeolocationEmulator();
  geo.add('My City', { latitude: 10, longitude: 20, accuracy: 100 });
  const list = geo.list();
  assert.ok(list.has('My City'));
  assert.equal(list.get('My City').type, 'custom');
});

// ── get ───────────────────────────────────────────────────────────────────────

test('get: returns spec for a preset', () => {
  const geo  = new GeolocationEmulator();
  const spec = geo.get('London');
  assert.ok(spec != null);
  assert.ok(typeof spec.latitude  === 'number');
  assert.ok(typeof spec.longitude === 'number');
  assert.ok(typeof spec.accuracy  === 'number');
});

test('get: returns null for unknown name', () => {
  assert.equal(new GeolocationEmulator().get('Atlantis'), null);
});

test('get: returns a copy — mutation does not affect emulator', () => {
  const geo  = new GeolocationEmulator();
  const spec = geo.get('Tokyo');
  spec.latitude = 999;
  assert.notEqual(geo.get('Tokyo').latitude, 999);
});

// ── resolve ───────────────────────────────────────────────────────────────────

test('resolve: returns spec for known preset', () => {
  const spec = new GeolocationEmulator().resolve('Paris');
  assert.ok(spec != null);
});

test('resolve: throws for unknown name', () => {
  assert.throws(
    () => new GeolocationEmulator().resolve('Mordor'),
    /Unknown location/,
  );
});

// ── add ───────────────────────────────────────────────────────────────────────

test('add: stores custom location and get returns it', () => {
  const geo = new GeolocationEmulator();
  geo.add('Custom', { latitude: 1.23, longitude: 4.56, accuracy: 75 });
  const spec = geo.get('Custom');
  assert.ok(spec != null);
  assert.equal(spec.latitude,  1.23);
  assert.equal(spec.longitude, 4.56);
  assert.equal(spec.accuracy,  75);
});

test('add: defaults accuracy to 50 when omitted', () => {
  const geo  = new GeolocationEmulator();
  const spec = geo.add('NoAcc', { latitude: 0, longitude: 0 });
  assert.equal(spec.accuracy, 50);
});

test('add: throws when name is null', () => {
  assert.throws(() => new GeolocationEmulator().add(null, { latitude: 0, longitude: 0 }), /required/);
});

test('add: throws when name is blank', () => {
  assert.throws(() => new GeolocationEmulator().add('   ', { latitude: 0, longitude: 0 }), /blank/);
});

test('add: throws when trying to override a preset', () => {
  assert.throws(
    () => new GeolocationEmulator().add('Tokyo', { latitude: 0, longitude: 0 }),
    /Cannot override preset/,
  );
});

test('add: throws for latitude out of range (> 90)', () => {
  assert.throws(
    () => new GeolocationEmulator().add('Bad', { latitude: 91, longitude: 0 }),
    /latitude/,
  );
});

test('add: throws for latitude out of range (< -90)', () => {
  assert.throws(
    () => new GeolocationEmulator().add('Bad', { latitude: -91, longitude: 0 }),
    /latitude/,
  );
});

test('add: throws for longitude out of range (> 180)', () => {
  assert.throws(
    () => new GeolocationEmulator().add('Bad', { latitude: 0, longitude: 181 }),
    /longitude/,
  );
});

test('add: throws for longitude out of range (< -180)', () => {
  assert.throws(
    () => new GeolocationEmulator().add('Bad', { latitude: 0, longitude: -181 }),
    /longitude/,
  );
});

test('add: throws for non-positive accuracy', () => {
  assert.throws(
    () => new GeolocationEmulator().add('Bad', { latitude: 0, longitude: 0, accuracy: 0 }),
    /accuracy/,
  );
  assert.throws(
    () => new GeolocationEmulator().add('Bad2', { latitude: 0, longitude: 0, accuracy: -1 }),
    /accuracy/,
  );
});

// ── remove ────────────────────────────────────────────────────────────────────

test('remove: removes a custom location and returns true', () => {
  const geo = new GeolocationEmulator();
  geo.add('Temp', { latitude: 0, longitude: 0 });
  assert.equal(geo.remove('Temp'), true);
  assert.equal(geo.get('Temp'), null);
});

test('remove: returns false for non-existent custom name', () => {
  assert.equal(new GeolocationEmulator().remove('Ghost'), false);
});

test('remove: throws for preset names', () => {
  assert.throws(
    () => new GeolocationEmulator().remove('London'),
    /Cannot remove preset/,
  );
});

// ── validateSpec ─────────────────────────────────────────────────────────────

test('validateSpec: valid spec returns normalized object', () => {
  const geo  = new GeolocationEmulator();
  const spec = geo.validateSpec({ latitude: 1.5, longitude: -2.5, accuracy: 100 });
  assert.equal(spec.latitude,  1.5);
  assert.equal(spec.longitude, -2.5);
  assert.equal(spec.accuracy,  100);
});

test('validateSpec: defaults accuracy to 50', () => {
  const spec = new GeolocationEmulator().validateSpec({ latitude: 0, longitude: 0 });
  assert.equal(spec.accuracy, 50);
});

test('validateSpec: throws when latitude missing', () => {
  assert.throws(
    () => new GeolocationEmulator().validateSpec({ longitude: 0 }),
    /latitude/,
  );
});

test('validateSpec: throws for out-of-range values', () => {
  assert.throws(() => new GeolocationEmulator().validateSpec({ latitude: 100, longitude: 0 }), /latitude/);
  assert.throws(() => new GeolocationEmulator().validateSpec({ latitude: 0, longitude: 200 }), /longitude/);
});

// ── custom not in presets() ───────────────────────────────────────────────────

test('presets() does not include custom entries', () => {
  const geo = new GeolocationEmulator();
  geo.add('Hidden City', { latitude: 5, longitude: 5 });
  assert.ok(!geo.presets().includes('Hidden City'));
});

// ── BrowserService / BrowserManager source checks ─────────────────────────────

test('BrowserService source imports GeolocationEmulator', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('GeolocationEmulator'), 'GeolocationEmulator import missing');
});

test('BrowserService source includes geoEmulator instance', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('geoEmulator'), 'geoEmulator missing');
});

test('BrowserService source includes geoEmulate method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('geoEmulate'), 'geoEmulate missing');
});

test('BrowserManager source includes geo-emulate dispatch', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes("case 'geo-emulate'"), 'geo-emulate dispatch missing');
});

test('BrowserManager source includes geoActions in capabilities', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes('geoActions'), 'geoActions missing from capabilities');
});
