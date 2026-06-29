import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventRecorder, VALID_KINDS } from '../src/browser/EventRecorder.js';

// ── VALID_KINDS export ────────────────────────────────────────────────────────

test('VALID_KINDS: is a Set containing expected core kinds', () => {
  assert.ok(VALID_KINDS instanceof Set);
  for (const k of ['navigate', 'click', 'type', 'fill', 'press', 'hover', 'select', 'scroll', 'dialog', 'error', 'custom']) {
    assert.ok(VALID_KINDS.has(k), `expected VALID_KINDS to contain "${k}"`);
  }
});

// ── record: valid inputs ──────────────────────────────────────────────────────

test('EventRecorder: record returns event with id, targetId, kind, at', () => {
  const rec   = new EventRecorder();
  const event = rec.record('t1', { kind: 'click', selector: 'button' });
  assert.ok(event.id,       'id should be set');
  assert.equal(event.targetId, 't1');
  assert.equal(event.kind,     'click');
  assert.ok(event.at,          'at should be set');
});

test('EventRecorder: record stores extra detail fields', () => {
  const event = new EventRecorder().record('t1', { kind: 'type', selector: '#q', text: 'hello' });
  assert.equal(event.selector, '#q');
  assert.equal(event.text,     'hello');
});

test('EventRecorder: record uses provided at timestamp', () => {
  const ts    = '2024-06-01T10:00:00.000Z';
  const event = new EventRecorder().record('t1', { kind: 'navigate', url: 'https://a.com', at: ts });
  assert.equal(event.at, ts);
});

// ── record: validation ────────────────────────────────────────────────────────

test('EventRecorder: record without targetId throws', () => {
  assert.throws(() => new EventRecorder().record(undefined, { kind: 'click' }), /targetId/i);
});

test('EventRecorder: record with null targetId throws', () => {
  assert.throws(() => new EventRecorder().record(null, { kind: 'click' }), /targetId/i);
});

test('EventRecorder: record with empty string targetId throws', () => {
  assert.throws(() => new EventRecorder().record('', { kind: 'click' }), /targetId/i);
});

test('EventRecorder: record without kind throws', () => {
  assert.throws(() => new EventRecorder().record('t1', {}), /kind/i);
});

test('EventRecorder: record with invalid kind throws', () => {
  assert.throws(() => new EventRecorder().record('t1', { kind: 'zoom' }), /kind/i);
});

// ── size / sizeFor ────────────────────────────────────────────────────────────

test('EventRecorder: size is 0 initially', () => {
  assert.equal(new EventRecorder().size, 0);
});

test('EventRecorder: size increments with each record', () => {
  const rec = new EventRecorder();
  rec.record('t1', { kind: 'click' });
  rec.record('t2', { kind: 'navigate', url: 'https://a.com' });
  assert.equal(rec.size, 2);
});

test('EventRecorder: sizeFor returns count for specific targetId', () => {
  const rec = new EventRecorder();
  rec.record('t1', { kind: 'click' });
  rec.record('t1', { kind: 'press', key: 'Enter' });
  rec.record('t2', { kind: 'click' });
  assert.equal(rec.sizeFor('t1'), 2);
  assert.equal(rec.sizeFor('t2'), 1);
});

test('EventRecorder: sizeFor returns 0 for unknown targetId', () => {
  assert.equal(new EventRecorder().sizeFor('ghost'), 0);
});

// ── list ──────────────────────────────────────────────────────────────────────

test('EventRecorder: list returns empty array initially', () => {
  assert.deepEqual(new EventRecorder().list(), []);
});

test('EventRecorder: list returns all events without filter', () => {
  const rec = new EventRecorder();
  rec.record('t1', { kind: 'click' });
  rec.record('t2', { kind: 'navigate', url: 'https://a.com' });
  assert.equal(rec.list().length, 2);
});

test('EventRecorder: list filters by targetId', () => {
  const rec = new EventRecorder();
  rec.record('t1', { kind: 'click' });
  rec.record('t2', { kind: 'click' });
  rec.record('t1', { kind: 'press', key: 'Tab' });
  const result = rec.list({ targetId: 't1' });
  assert.equal(result.length, 2);
  assert.ok(result.every((e) => e.targetId === 't1'));
});

test('EventRecorder: list filters by kind', () => {
  const rec = new EventRecorder();
  rec.record('t1', { kind: 'click' });
  rec.record('t1', { kind: 'navigate', url: 'https://a.com' });
  rec.record('t1', { kind: 'click' });
  const result = rec.list({ kind: 'click' });
  assert.equal(result.length, 2);
  assert.ok(result.every((e) => e.kind === 'click'));
});

test('EventRecorder: list filters by since timestamp', () => {
  const rec = new EventRecorder();
  rec.record('t1', { kind: 'click',    at: '2024-01-01T00:00:00.000Z' });
  rec.record('t1', { kind: 'navigate', at: '2024-06-01T00:00:00.000Z', url: 'https://a.com' });
  rec.record('t1', { kind: 'press',    at: '2024-12-01T00:00:00.000Z', key: 'Enter' });
  const result = rec.list({ since: '2024-06-01T00:00:00.000Z' });
  assert.equal(result.length, 2);
  assert.ok(result.every((e) => e.at >= '2024-06-01T00:00:00.000Z'));
});

test('EventRecorder: list with limit returns first N events', () => {
  const rec = new EventRecorder();
  rec.record('t1', { kind: 'click',    at: '2024-01-01T00:00:00.000Z' });
  rec.record('t1', { kind: 'navigate', at: '2024-01-02T00:00:00.000Z', url: 'https://a.com' });
  rec.record('t1', { kind: 'press',    at: '2024-01-03T00:00:00.000Z', key: 'Tab' });
  const result = rec.list({ limit: 2 });
  assert.equal(result.length, 2);
  assert.equal(result[0].kind, 'click');
  assert.equal(result[1].kind, 'navigate');
});

test('EventRecorder: list returns copies — mutation does not affect store', () => {
  const rec = new EventRecorder();
  rec.record('t1', { kind: 'click', selector: '#btn' });
  const result = rec.list();
  result[0].kind = 'error';
  assert.equal(rec.list()[0].kind, 'click');
});

// ── clear / clearAll ──────────────────────────────────────────────────────────

test('EventRecorder: clear removes events for targetId and returns count', () => {
  const rec = new EventRecorder();
  rec.record('t1', { kind: 'click' });
  rec.record('t1', { kind: 'press', key: 'Enter' });
  rec.record('t2', { kind: 'click' });
  const removed = rec.clear('t1');
  assert.equal(removed, 2);
  assert.equal(rec.size, 1);
  assert.equal(rec.sizeFor('t1'), 0);
  assert.equal(rec.sizeFor('t2'), 1);
});

test('EventRecorder: clear without targetId throws', () => {
  assert.throws(() => new EventRecorder().clear(), /targetId/i);
});

test('EventRecorder: clear with empty string targetId throws', () => {
  assert.throws(() => new EventRecorder().clear(''), /targetId/i);
});

test('EventRecorder: clearAll removes all events and returns count', () => {
  const rec = new EventRecorder();
  rec.record('t1', { kind: 'click' });
  rec.record('t2', { kind: 'navigate', url: 'https://a.com' });
  const removed = rec.clearAll();
  assert.equal(removed, 2);
  assert.equal(rec.size, 0);
});

// ── toScript ──────────────────────────────────────────────────────────────────

test('EventRecorder: toScript returns { steps } array', () => {
  const { steps } = new EventRecorder().toScript();
  assert.ok(Array.isArray(steps));
});

test('EventRecorder: toScript excludes non-scriptable kinds (navigate, dialog, error, custom, scroll)', () => {
  const rec = new EventRecorder();
  rec.record('t1', { kind: 'navigate', url: 'https://a.com' });
  rec.record('t1', { kind: 'dialog' });
  rec.record('t1', { kind: 'error' });
  rec.record('t1', { kind: 'custom' });
  rec.record('t1', { kind: 'scroll' });
  const { steps } = rec.toScript('t1');
  assert.equal(steps.length, 0, 'non-scriptable kinds should produce no steps');
});

test('EventRecorder: toScript includes click, type, fill, press, hover, select', () => {
  const rec = new EventRecorder();
  rec.record('t1', { kind: 'click',  selector: '#a' });
  rec.record('t1', { kind: 'type',   selector: '#b', text: 'hi' });
  rec.record('t1', { kind: 'fill',   fields: [{ selector: '#c', value: 'x' }] });
  rec.record('t1', { kind: 'press',  key: 'Enter' });
  rec.record('t1', { kind: 'hover',  selector: '#d' });
  rec.record('t1', { kind: 'select', selector: '#e', values: ['opt1'] });
  const { steps } = rec.toScript('t1');
  assert.equal(steps.length, 6);
});

test('EventRecorder: toScript click step has kind and selector', () => {
  const rec = new EventRecorder();
  rec.record('t1', { kind: 'click', selector: '#submit', ref: 'e1' });
  const [step] = rec.toScript('t1').steps;
  assert.equal(step.kind,     'click');
  assert.equal(step.selector, '#submit');
  assert.equal(step.ref,      'e1');
});

test('EventRecorder: toScript type step has kind, selector, text', () => {
  const rec = new EventRecorder();
  rec.record('t1', { kind: 'type', selector: '#q', text: 'search term' });
  const [step] = rec.toScript('t1').steps;
  assert.equal(step.kind,     'type');
  assert.equal(step.selector, '#q');
  assert.equal(step.text,     'search term');
});

test('EventRecorder: toScript press step has kind and key', () => {
  const rec = new EventRecorder();
  rec.record('t1', { kind: 'press', key: 'Tab' });
  const [step] = rec.toScript('t1').steps;
  assert.equal(step.kind, 'press');
  assert.equal(step.key,  'Tab');
});

test('EventRecorder: toScript fill step has kind and fields', () => {
  const rec = new EventRecorder();
  const fields = [{ selector: '#name', value: 'Alice' }];
  rec.record('t1', { kind: 'fill', fields });
  const [step] = rec.toScript('t1').steps;
  assert.equal(step.kind, 'fill');
  assert.deepEqual(step.fields, fields);
});

test('EventRecorder: toScript with targetId includes only that page events', () => {
  const rec = new EventRecorder();
  rec.record('t1', { kind: 'click', selector: '#a' });
  rec.record('t2', { kind: 'click', selector: '#b' });
  const { steps } = rec.toScript('t1');
  assert.equal(steps.length, 1);
  assert.equal(steps[0].selector, '#a');
});

test('EventRecorder: toScript without targetId includes all pages', () => {
  const rec = new EventRecorder();
  rec.record('t1', { kind: 'click', selector: '#a' });
  rec.record('t2', { kind: 'press', key: 'Escape' });
  const { steps } = rec.toScript();
  assert.equal(steps.length, 2);
});

// ── BrowserService / BrowserManager source checks ─────────────────────────────

test('BrowserService source includes EventRecorder import', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('EventRecorder'), 'EventRecorder import missing from BrowserService');
});

test('BrowserService source includes eventList, eventClear, eventScript methods', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('eventList'),   'eventList missing');
  assert.ok(src.includes('eventClear'),  'eventClear missing');
  assert.ok(src.includes('eventScript'), 'eventScript missing');
});

test('BrowserManager source includes event-list, event-clear, event-script dispatch', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes("case 'event-list'"),   'event-list dispatch missing');
  assert.ok(src.includes("case 'event-clear'"),  'event-clear dispatch missing');
  assert.ok(src.includes("case 'event-script'"), 'event-script dispatch missing');
});

test('BrowserManager source includes eventActions in capabilities', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes('eventActions'), 'eventActions missing from capabilities');
});
