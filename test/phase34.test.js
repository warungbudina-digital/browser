import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LocaleEmulator } from '../src/browser/LocaleEmulator.js';

// ── presets ───────────────────────────────────────────────────────────────────

test('presets: returns array of strings', () => {
  const emu = new LocaleEmulator();
  const p   = emu.presets();
  assert.ok(Array.isArray(p));
  assert.ok(p.every((x) => typeof x === 'string'));
});

test('presets: includes known locales', () => {
  const emu = new LocaleEmulator();
  const p   = emu.presets();
  for (const name of ['en-US', 'ja-JP', 'ar-SA', 'id-ID', 'de-DE']) {
    assert.ok(p.includes(name), `missing preset: ${name}`);
  }
});

test('presets: has exactly 12 built-in entries', () => {
  assert.equal(new LocaleEmulator().presets().length, 12);
});

// ── list ──────────────────────────────────────────────────────────────────────

test('list: returns a Map', () => {
  assert.ok(new LocaleEmulator().list() instanceof Map);
});

test('list: preset entries have type "preset"', () => {
  const emu = new LocaleEmulator();
  for (const [, spec] of emu.list()) assert.equal(spec.type, 'preset');
});

test('list: custom entries have type "custom"', () => {
  const emu = new LocaleEmulator();
  emu.add('Custom', { locale: 'xx-XX', timezone: 'UTC' });
  assert.equal(emu.list().get('Custom').type, 'custom');
});

// ── get ───────────────────────────────────────────────────────────────────────

test('get: returns spec for a preset with required fields', () => {
  const spec = new LocaleEmulator().get('en-US');
  assert.ok(spec != null);
  assert.ok(typeof spec.locale    === 'string');
  assert.ok(typeof spec.timezone  === 'string');
  assert.ok(typeof spec.direction === 'string');
});

test('get: ar-SA has direction "rtl"', () => {
  assert.equal(new LocaleEmulator().get('ar-SA').direction, 'rtl');
});

test('get: non-rtl presets have direction "ltr"', () => {
  for (const name of ['en-US', 'ja-JP', 'de-DE', 'id-ID']) {
    assert.equal(new LocaleEmulator().get(name).direction, 'ltr');
  }
});

test('get: returns null for unknown name', () => {
  assert.equal(new LocaleEmulator().get('zz-ZZ'), null);
});

test('get: returns a copy — mutation does not affect emulator', () => {
  const emu  = new LocaleEmulator();
  const spec = emu.get('en-US');
  spec.locale = 'changed';
  assert.equal(emu.get('en-US').locale, 'en-US');
});

// ── resolve ───────────────────────────────────────────────────────────────────

test('resolve: returns spec for known preset', () => {
  assert.ok(new LocaleEmulator().resolve('fr-FR') != null);
});

test('resolve: throws for unknown name', () => {
  assert.throws(() => new LocaleEmulator().resolve('xx-XX'), /Unknown locale/);
});

// ── add ───────────────────────────────────────────────────────────────────────

test('add: stores custom locale and get returns it', () => {
  const emu  = new LocaleEmulator();
  emu.add('Test', { locale: 'test-LOCALE', timezone: 'UTC', currency: 'TST' });
  const spec = emu.get('Test');
  assert.equal(spec.locale,   'test-LOCALE');
  assert.equal(spec.timezone, 'UTC');
  assert.equal(spec.currency, 'TST');
});

test('add: defaults direction to "ltr"', () => {
  const emu  = new LocaleEmulator();
  const spec = emu.add('Neutral', { locale: 'xx-XX', timezone: 'UTC' });
  assert.equal(spec.direction, 'ltr');
});

test('add: throws for null name', () => {
  assert.throws(() => new LocaleEmulator().add(null, { locale: 'a', timezone: 'UTC' }), /required/);
});

test('add: throws for blank name', () => {
  assert.throws(() => new LocaleEmulator().add('  ', { locale: 'a', timezone: 'UTC' }), /blank/);
});

test('add: throws when trying to override a preset', () => {
  assert.throws(
    () => new LocaleEmulator().add('en-US', { locale: 'en-US', timezone: 'UTC' }),
    /Cannot override preset/,
  );
});

test('add: throws for missing locale', () => {
  assert.throws(() => new LocaleEmulator().add('X', { timezone: 'UTC' }), /locale/);
});

test('add: throws for blank locale', () => {
  assert.throws(() => new LocaleEmulator().add('X', { locale: '  ', timezone: 'UTC' }), /locale/);
});

test('add: throws for missing timezone', () => {
  assert.throws(() => new LocaleEmulator().add('X', { locale: 'en-US' }), /timezone/);
});

test('add: throws for invalid direction', () => {
  assert.throws(
    () => new LocaleEmulator().add('X', { locale: 'x', timezone: 'UTC', direction: 'sideways' }),
    /direction/,
  );
});

test('add: accepts valid direction "rtl"', () => {
  const emu  = new LocaleEmulator();
  const spec = emu.add('RTL', { locale: 'ar-XX', timezone: 'UTC', direction: 'rtl' });
  assert.equal(spec.direction, 'rtl');
});

// ── remove ────────────────────────────────────────────────────────────────────

test('remove: removes a custom locale and returns true', () => {
  const emu = new LocaleEmulator();
  emu.add('Tmp', { locale: 'tmp', timezone: 'UTC' });
  assert.equal(emu.remove('Tmp'), true);
  assert.equal(emu.get('Tmp'), null);
});

test('remove: returns false for non-existent name', () => {
  assert.equal(new LocaleEmulator().remove('Ghost'), false);
});

test('remove: throws for preset names', () => {
  assert.throws(() => new LocaleEmulator().remove('en-US'), /Cannot remove preset/);
});

// ── validateSpec ──────────────────────────────────────────────────────────────

test('validateSpec: valid spec returns normalized object', () => {
  const emu  = new LocaleEmulator();
  const spec = emu.validateSpec({ locale: 'en-AU', timezone: 'Australia/Sydney', direction: 'ltr' });
  assert.equal(spec.locale,   'en-AU');
  assert.equal(spec.timezone, 'Australia/Sydney');
});

test('validateSpec: throws for missing locale', () => {
  assert.throws(() => new LocaleEmulator().validateSpec({ timezone: 'UTC' }), /locale/);
});

// ── presets() excludes custom ─────────────────────────────────────────────────

test('presets() does not include custom entries', () => {
  const emu = new LocaleEmulator();
  emu.add('Hidden', { locale: 'h', timezone: 'UTC' });
  assert.ok(!emu.presets().includes('Hidden'));
});

// ── source checks ─────────────────────────────────────────────────────────────

test('BrowserService source imports LocaleEmulator', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('LocaleEmulator'), 'LocaleEmulator import missing');
});

test('BrowserService source includes localeEmulate method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('localeEmulate'), 'localeEmulate method missing');
});

test('BrowserManager source includes locale-emulate dispatch', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes("case 'locale-emulate'"), 'locale-emulate dispatch missing');
});

test('BrowserManager source includes localeActions in capabilities', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes('localeActions'), 'localeActions missing from capabilities');
});
