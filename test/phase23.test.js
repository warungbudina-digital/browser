import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DeviceEmulator } from '../src/browser/DeviceEmulator.js';

// ── presets() ─────────────────────────────────────────────────────────────────

test('DeviceEmulator: presets() returns array of strings', () => {
  const emu = new DeviceEmulator();
  const ps  = emu.presets();
  assert.ok(Array.isArray(ps));
  assert.ok(ps.length > 0);
  assert.ok(ps.every((n) => typeof n === 'string'));
});

test('DeviceEmulator: presets() contains expected built-in names', () => {
  const ps = new DeviceEmulator().presets();
  for (const name of ['iPhone 14', 'Pixel 7', 'iPad Air', 'Desktop HD']) {
    assert.ok(ps.includes(name), `expected preset "${name}"`);
  }
});

// ── list() ────────────────────────────────────────────────────────────────────

test('DeviceEmulator: list() returns all preset names when no custom devices', () => {
  const emu = new DeviceEmulator();
  assert.deepEqual(emu.list(), emu.presets());
});

test('DeviceEmulator: list() includes custom devices after add()', () => {
  const emu = new DeviceEmulator();
  emu.add('My Device', { width: 360, height: 780 });
  assert.ok(emu.list().includes('My Device'));
});

// ── get() ─────────────────────────────────────────────────────────────────────

test('DeviceEmulator: get() returns spec for a preset name', () => {
  const spec = new DeviceEmulator().get('iPhone 14');
  assert.ok(spec);
  assert.equal(spec.name,  'iPhone 14');
  assert.equal(spec.width,  390);
  assert.equal(spec.height, 844);
  assert.ok(spec.mobile === true);
});

test('DeviceEmulator: get() returns null for unknown name', () => {
  assert.equal(new DeviceEmulator().get('Banana Phone'), null);
});

test('DeviceEmulator: get() spec always has deviceScaleFactor, mobile, userAgent fields', () => {
  const spec = new DeviceEmulator().get('Desktop HD');
  assert.ok('deviceScaleFactor' in spec, 'deviceScaleFactor missing');
  assert.ok('mobile'            in spec, 'mobile missing');
  assert.ok('userAgent'         in spec, 'userAgent missing');
});

test('DeviceEmulator: get() returns null for empty string', () => {
  assert.equal(new DeviceEmulator().get(''), null);
});

// ── resolve() ─────────────────────────────────────────────────────────────────

test('DeviceEmulator: resolve() returns spec for a preset name', () => {
  const spec = new DeviceEmulator().resolve('Pixel 7');
  assert.equal(spec.name,  'Pixel 7');
  assert.equal(spec.width,  412);
});

test('DeviceEmulator: resolve() throws for unknown name', () => {
  assert.throws(() => new DeviceEmulator().resolve('No Such Device'), /unknown device/i);
});

test('DeviceEmulator: resolve() returns spec for a custom device after add()', () => {
  const emu = new DeviceEmulator();
  emu.add('Custom', { width: 500, height: 900 });
  const spec = emu.resolve('Custom');
  assert.equal(spec.width, 500);
});

// ── add() ─────────────────────────────────────────────────────────────────────

test('DeviceEmulator: add() registers custom device and returns spec with name', () => {
  const emu  = new DeviceEmulator();
  const spec = emu.add('TestPhone', { width: 360, height: 800 });
  assert.equal(spec.name,   'TestPhone');
  assert.equal(spec.width,  360);
  assert.equal(spec.height, 800);
});

test('DeviceEmulator: add() custom device is retrievable via get()', () => {
  const emu = new DeviceEmulator();
  emu.add('TestPhone', { width: 360, height: 800 });
  assert.ok(emu.get('TestPhone'));
});

test('DeviceEmulator: add() defaults deviceScaleFactor=1, mobile=false, userAgent=null', () => {
  const spec = new DeviceEmulator().add('Basic', { width: 200, height: 400 });
  assert.equal(spec.deviceScaleFactor, 1);
  assert.equal(spec.mobile,     false);
  assert.equal(spec.userAgent,  null);
});

test('DeviceEmulator: add() stores provided userAgent', () => {
  const ua   = 'Mozilla/5.0 CustomUA';
  const spec = new DeviceEmulator().add('UA Device', { width: 360, height: 800, userAgent: ua });
  assert.equal(spec.userAgent, ua);
});

test('DeviceEmulator: add() allows overwriting existing custom device', () => {
  const emu = new DeviceEmulator();
  emu.add('Flex', { width: 360, height: 800 });
  emu.add('Flex', { width: 414, height: 896 });
  assert.equal(emu.get('Flex').width, 414);
});

test('DeviceEmulator: add() without name throws', () => {
  assert.throws(() => new DeviceEmulator().add('', { width: 360, height: 800 }), /name/i);
});

test('DeviceEmulator: add() with preset name throws', () => {
  assert.throws(() => new DeviceEmulator().add('iPhone 14', { width: 390, height: 844 }), /preset/i);
});

test('DeviceEmulator: add() with width < 100 throws', () => {
  assert.throws(() => new DeviceEmulator().add('Tiny', { width: 99, height: 200 }), /width/i);
});

test('DeviceEmulator: add() with non-integer width throws', () => {
  assert.throws(() => new DeviceEmulator().add('Bad', { width: 360.5, height: 800 }), /width/i);
});

test('DeviceEmulator: add() with height < 100 throws', () => {
  assert.throws(() => new DeviceEmulator().add('Short', { width: 360, height: 50 }), /height/i);
});

test('DeviceEmulator: add() with deviceScaleFactor=0 throws', () => {
  assert.throws(() => new DeviceEmulator().add('Bad', { width: 360, height: 800, deviceScaleFactor: 0 }), /deviceScaleFactor/i);
});

test('DeviceEmulator: add() with negative deviceScaleFactor throws', () => {
  assert.throws(() => new DeviceEmulator().add('Bad', { width: 360, height: 800, deviceScaleFactor: -1 }), /deviceScaleFactor/i);
});

// ── remove() ──────────────────────────────────────────────────────────────────

test('DeviceEmulator: remove() returns true when custom device found and removed', () => {
  const emu = new DeviceEmulator();
  emu.add('Temp', { width: 300, height: 600 });
  assert.equal(emu.remove('Temp'), true);
});

test('DeviceEmulator: remove() makes device unreachable via get()', () => {
  const emu = new DeviceEmulator();
  emu.add('Gone', { width: 300, height: 600 });
  emu.remove('Gone');
  assert.equal(emu.get('Gone'), null);
});

test('DeviceEmulator: remove() returns false for non-existent custom device', () => {
  assert.equal(new DeviceEmulator().remove('Does Not Exist'), false);
});

test('DeviceEmulator: remove() throws for built-in preset', () => {
  assert.throws(() => new DeviceEmulator().remove('iPhone 14'), /preset/i);
});

// ── BrowserService / BrowserManager source checks ─────────────────────────────

test('BrowserService source includes DeviceEmulator import', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('DeviceEmulator'), 'DeviceEmulator import missing');
});

test('BrowserService source includes deviceEmulate, deviceReset, deviceList methods', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('deviceEmulate'), 'deviceEmulate missing');
  assert.ok(src.includes('deviceReset'),   'deviceReset missing');
  assert.ok(src.includes('deviceList'),    'deviceList missing');
});

test('BrowserManager source includes device-list, device-emulate, device-reset dispatch', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes("case 'device-list'"),    'device-list dispatch missing');
  assert.ok(src.includes("case 'device-emulate'"), 'device-emulate dispatch missing');
  assert.ok(src.includes("case 'device-reset'"),   'device-reset dispatch missing');
});

test('BrowserManager source includes deviceActions in capabilities', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes('deviceActions'), 'deviceActions missing from capabilities');
});
