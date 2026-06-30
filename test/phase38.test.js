import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MediaEmulator, MEDIA_FEATURES, VALID_MEDIA_TYPES } from '../src/browser/MediaEmulator.js';

// ── MEDIA_FEATURES ────────────────────────────────────────────────────────────

test('MEDIA_FEATURES has expected features', () => {
  for (const f of ['prefers-color-scheme', 'prefers-reduced-motion', 'prefers-contrast', 'forced-colors']) {
    assert.ok(Object.prototype.hasOwnProperty.call(MEDIA_FEATURES, f), `missing feature: ${f}`);
  }
});

test('MEDIA_FEATURES prefers-color-scheme includes light, dark, no-preference', () => {
  const vals = MEDIA_FEATURES['prefers-color-scheme'];
  assert.ok(vals.includes('light'));
  assert.ok(vals.includes('dark'));
  assert.ok(vals.includes('no-preference'));
});

test('MEDIA_FEATURES prefers-reduced-motion includes reduce and no-preference', () => {
  const vals = MEDIA_FEATURES['prefers-reduced-motion'];
  assert.ok(vals.includes('reduce'));
  assert.ok(vals.includes('no-preference'));
});

// ── VALID_MEDIA_TYPES ─────────────────────────────────────────────────────────

test('VALID_MEDIA_TYPES contains screen, print, and empty string', () => {
  assert.ok(VALID_MEDIA_TYPES.has('screen'));
  assert.ok(VALID_MEDIA_TYPES.has('print'));
  assert.ok(VALID_MEDIA_TYPES.has(''));
});

// ── setFeature ────────────────────────────────────────────────────────────────

test('setFeature: stores a valid feature', () => {
  const em = new MediaEmulator();
  em.setFeature('prefers-color-scheme', 'dark');
  assert.equal(em.getFeature('prefers-color-scheme'), 'dark');
});

test('setFeature: overwrites previous value', () => {
  const em = new MediaEmulator();
  em.setFeature('prefers-color-scheme', 'light');
  em.setFeature('prefers-color-scheme', 'dark');
  assert.equal(em.getFeature('prefers-color-scheme'), 'dark');
});

test('setFeature: throws for unknown feature name', () => {
  assert.throws(() => new MediaEmulator().setFeature('prefers-unicorns', 'yes'), /Unknown media feature/);
});

test('setFeature: throws for invalid value for known feature', () => {
  assert.throws(() => new MediaEmulator().setFeature('prefers-color-scheme', 'purple'), /Invalid value/);
});

test('setFeature: can set multiple features independently', () => {
  const em = new MediaEmulator();
  em.setFeature('prefers-color-scheme', 'dark');
  em.setFeature('prefers-reduced-motion', 'reduce');
  assert.equal(em.getFeature('prefers-color-scheme'),   'dark');
  assert.equal(em.getFeature('prefers-reduced-motion'), 'reduce');
});

// ── removeFeature ─────────────────────────────────────────────────────────────

test('removeFeature: returns true and removes the feature', () => {
  const em = new MediaEmulator();
  em.setFeature('forced-colors', 'active');
  assert.equal(em.removeFeature('forced-colors'), true);
  assert.equal(em.getFeature('forced-colors'), null);
});

test('removeFeature: returns false if feature not set', () => {
  assert.equal(new MediaEmulator().removeFeature('prefers-contrast'), false);
});

// ── setMediaType ──────────────────────────────────────────────────────────────

test('setMediaType: stores screen', () => {
  const em = new MediaEmulator();
  em.setMediaType('screen');
  assert.equal(em.currentMediaType(), 'screen');
});

test('setMediaType: stores print', () => {
  const em = new MediaEmulator();
  em.setMediaType('print');
  assert.equal(em.currentMediaType(), 'print');
});

test('setMediaType: stores empty string to clear', () => {
  const em = new MediaEmulator();
  em.setMediaType('screen');
  em.setMediaType('');
  assert.equal(em.currentMediaType(), '');
});

test('setMediaType: throws for invalid type', () => {
  assert.throws(() => new MediaEmulator().setMediaType('mobile'), /Invalid media type/);
});

// ── getFeature ────────────────────────────────────────────────────────────────

test('getFeature: returns null if not set', () => {
  assert.equal(new MediaEmulator().getFeature('prefers-color-scheme'), null);
});

// ── currentFeatures ───────────────────────────────────────────────────────────

test('currentFeatures: returns empty array initially', () => {
  assert.deepEqual(new MediaEmulator().currentFeatures(), []);
});

test('currentFeatures: returns name/value pairs for all set features', () => {
  const em = new MediaEmulator();
  em.setFeature('prefers-color-scheme', 'dark');
  em.setFeature('forced-colors', 'none');
  const features = em.currentFeatures();
  assert.ok(features.some((f) => f.name === 'prefers-color-scheme' && f.value === 'dark'));
  assert.ok(features.some((f) => f.name === 'forced-colors'        && f.value === 'none'));
});

// ── currentMediaType ──────────────────────────────────────────────────────────

test('currentMediaType: returns empty string initially', () => {
  assert.equal(new MediaEmulator().currentMediaType(), '');
});

// ── reset ─────────────────────────────────────────────────────────────────────

test('reset: clears all features and media type', () => {
  const em = new MediaEmulator();
  em.setFeature('prefers-color-scheme', 'dark');
  em.setMediaType('print');
  em.reset();
  assert.deepEqual(em.currentFeatures(), []);
  assert.equal(em.currentMediaType(), '');
  assert.equal(em.size, 0);
});

// ── toCDP ─────────────────────────────────────────────────────────────────────

test('toCDP: returns media and features fields', () => {
  const em = new MediaEmulator();
  const cdp = em.toCDP();
  assert.ok(Object.prototype.hasOwnProperty.call(cdp, 'media'));
  assert.ok(Object.prototype.hasOwnProperty.call(cdp, 'features'));
  assert.ok(Array.isArray(cdp.features));
});

test('toCDP: reflects set state', () => {
  const em = new MediaEmulator();
  em.setFeature('prefers-color-scheme', 'dark');
  em.setMediaType('screen');
  const cdp = em.toCDP();
  assert.equal(cdp.media, 'screen');
  assert.ok(cdp.features.some((f) => f.name === 'prefers-color-scheme' && f.value === 'dark'));
});

test('toCDP: initially empty features and blank media', () => {
  const cdp = new MediaEmulator().toCDP();
  assert.equal(cdp.media, '');
  assert.deepEqual(cdp.features, []);
});

// ── size ──────────────────────────────────────────────────────────────────────

test('size: 0 initially', () => {
  assert.equal(new MediaEmulator().size, 0);
});

test('size: increments when feature set', () => {
  const em = new MediaEmulator();
  em.setFeature('prefers-color-scheme', 'dark');
  assert.equal(em.size, 1);
  em.setFeature('forced-colors', 'active');
  assert.equal(em.size, 2);
});

test('size: decrements when feature removed', () => {
  const em = new MediaEmulator();
  em.setFeature('prefers-color-scheme', 'dark');
  em.removeFeature('prefers-color-scheme');
  assert.equal(em.size, 0);
});

test('size: overwrite does not increase count', () => {
  const em = new MediaEmulator();
  em.setFeature('prefers-color-scheme', 'dark');
  em.setFeature('prefers-color-scheme', 'light');
  assert.equal(em.size, 1);
});

// ── source checks ─────────────────────────────────────────────────────────────

test('BrowserService imports MediaEmulator', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('MediaEmulator'), 'MediaEmulator import missing');
});

test('BrowserService includes mediaEmulator instance', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('mediaEmulator'), 'mediaEmulator instance missing');
});

test('BrowserService includes mediaSet method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('mediaSet'), 'mediaSet method missing');
});

test('BrowserService includes mediaReset method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('mediaReset'), 'mediaReset method missing');
});

test('BrowserManager includes media-set dispatch', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes("case 'media-set'"), 'media-set dispatch missing');
});

test('BrowserManager includes mediaActions in capabilities', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes('mediaActions'), 'mediaActions missing from capabilities');
});
