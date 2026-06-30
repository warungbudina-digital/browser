import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  filterByMessage, filterByStack, filterSince, filterBefore,
  groupByOrigin, deduplicateByMessage, summarize, formatText,
} from '../src/browser/ErrorFilter.js';

// Helper
const mkErr = (message, stack = null, at = '2024-01-01T00:00:00.000Z') =>
  ({ message, stack, at });

const STACK_A = 'TypeError: foo\n    at doFoo (app.js:10:5)\n    at main (app.js:50:3)';
const STACK_B = 'ReferenceError: bar\n    at doBar (utils.js:5:1)';

// ── filterByMessage ───────────────────────────────────────────────────────────

test('filterByMessage: string does substring match', () => {
  const errors = [mkErr('TypeError: foo'), mkErr('ReferenceError: bar'), mkErr('TypeError: baz')];
  const result = filterByMessage(errors, 'TypeError');
  assert.equal(result.length, 2);
});

test('filterByMessage: RegExp match', () => {
  const errors = [mkErr('Cannot read property'), mkErr('Cannot set property'), mkErr('undefined is not')];
  assert.equal(filterByMessage(errors, /Cannot .+ property/).length, 2);
});

test('filterByMessage: returns empty when no match', () => {
  assert.equal(filterByMessage([mkErr('foo')], 'bar').length, 0);
});

test('filterByMessage: returns copies — mutation safe', () => {
  const errors = [mkErr('foo')];
  const result = filterByMessage(errors, 'foo');
  result[0].message = 'changed';
  assert.equal(errors[0].message, 'foo');
});

// ── filterByStack ─────────────────────────────────────────────────────────────

test('filterByStack: string does substring match on stack', () => {
  const errors = [mkErr('e1', STACK_A), mkErr('e2', STACK_B), mkErr('e3', STACK_A)];
  assert.equal(filterByStack(errors, 'app.js').length, 2);
});

test('filterByStack: RegExp match on stack', () => {
  const errors = [mkErr('e1', STACK_A), mkErr('e2', STACK_B)];
  assert.equal(filterByStack(errors, /utils\.js/).length, 1);
});

test('filterByStack: null stack treated as empty string', () => {
  const errors = [mkErr('e', null)];
  assert.equal(filterByStack(errors, 'app.js').length, 0);
  assert.equal(filterByStack(errors, '').length, 1);
});

// ── filterSince / filterBefore ────────────────────────────────────────────────

test('filterSince: returns entries at or after given ISO', () => {
  const errors = [
    mkErr('a', null, '2024-01-01T00:00:00.000Z'),
    mkErr('b', null, '2024-01-02T00:00:00.000Z'),
    mkErr('c', null, '2024-01-03T00:00:00.000Z'),
  ];
  assert.equal(filterSince(errors, '2024-01-02T00:00:00.000Z').length, 2);
});

test('filterSince: boundary is inclusive', () => {
  const errors = [mkErr('x', null, '2024-06-01T00:00:00.000Z')];
  assert.equal(filterSince(errors, '2024-06-01T00:00:00.000Z').length, 1);
});

test('filterBefore: returns entries strictly before given ISO', () => {
  const errors = [
    mkErr('a', null, '2024-01-01T00:00:00.000Z'),
    mkErr('b', null, '2024-01-03T00:00:00.000Z'),
  ];
  assert.equal(filterBefore(errors, '2024-01-03T00:00:00.000Z').length, 1);
});

// ── groupByOrigin ─────────────────────────────────────────────────────────────

test('groupByOrigin: groups by first "at" stack line', () => {
  const errors = [mkErr('e1', STACK_A), mkErr('e2', STACK_A), mkErr('e3', STACK_B)];
  const groups = groupByOrigin(errors);
  const keys   = Object.keys(groups);
  assert.equal(keys.length, 2);
});

test('groupByOrigin: null stack → "unknown" group', () => {
  const errors = [mkErr('e', null)];
  const groups = groupByOrigin(errors);
  assert.ok('unknown' in groups);
  assert.equal(groups.unknown.length, 1);
});

test('groupByOrigin: returns empty object for empty input', () => {
  assert.deepEqual(groupByOrigin([]), {});
});

test('groupByOrigin: copies entries — mutation safe', () => {
  const errors = [mkErr('e', STACK_A)];
  const groups = groupByOrigin(errors);
  const key    = Object.keys(groups)[0];
  groups[key][0].message = 'changed';
  assert.equal(errors[0].message, 'e');
});

// ── deduplicateByMessage ──────────────────────────────────────────────────────

test('deduplicateByMessage: removes duplicate messages', () => {
  const errors = [mkErr('foo'), mkErr('bar'), mkErr('foo')];
  const result = deduplicateByMessage(errors);
  assert.equal(result.length, 2);
});

test('deduplicateByMessage: keeps first occurrence', () => {
  const errors = [
    mkErr('dup', STACK_A, '2024-01-01T00:00:00.000Z'),
    mkErr('dup', STACK_B, '2024-01-02T00:00:00.000Z'),
  ];
  const result = deduplicateByMessage(errors);
  assert.equal(result.length, 1);
  assert.equal(result[0].stack, STACK_A);
});

test('deduplicateByMessage: keeps all when messages are unique', () => {
  const errors = [mkErr('a'), mkErr('b'), mkErr('c')];
  assert.equal(deduplicateByMessage(errors).length, 3);
});

test('deduplicateByMessage: returns copies', () => {
  const errors = [mkErr('x')];
  const result = deduplicateByMessage(errors);
  result[0].message = 'changed';
  assert.equal(errors[0].message, 'x');
});

// ── summarize ─────────────────────────────────────────────────────────────────

test('summarize: counts total', () => {
  const errors = [mkErr('a', STACK_A), mkErr('b', STACK_B)];
  assert.equal(summarize(errors).total, 2);
});

test('summarize: first and last timestamps', () => {
  const errors = [
    mkErr('a', null, '2024-01-02T00:00:00.000Z'),
    mkErr('b', null, '2024-01-01T00:00:00.000Z'),
    mkErr('c', null, '2024-01-03T00:00:00.000Z'),
  ];
  const s = summarize(errors);
  assert.equal(s.first, '2024-01-01T00:00:00.000Z');
  assert.equal(s.last,  '2024-01-03T00:00:00.000Z');
});

test('summarize: empty → total 0 and null timestamps', () => {
  const s = summarize([]);
  assert.equal(s.total, 0);
  assert.equal(s.first, null);
  assert.equal(s.last,  null);
});

test('summarize: byOrigin counts', () => {
  const errors = [mkErr('e1', STACK_A), mkErr('e2', STACK_A), mkErr('e3', STACK_B)];
  const s = summarize(errors);
  assert.equal(Object.values(s.byOrigin).reduce((a, b) => a + b, 0), 3);
});

// ── formatText ────────────────────────────────────────────────────────────────

test('formatText: formats each entry as [HH:MM:SS] message', () => {
  const text = formatText([mkErr('bad thing', null, '2024-06-15T10:30:45.000Z')]);
  assert.ok(text.includes('[10:30:45]'));
  assert.ok(text.includes('bad thing'));
});

test('formatText: includes stack when stacks=true', () => {
  const text = formatText([mkErr('err', STACK_A)], { stacks: true });
  assert.ok(text.includes('at doFoo'));
});

test('formatText: no stack by default', () => {
  const text = formatText([mkErr('err', STACK_A)]);
  assert.ok(!text.includes('at doFoo'));
});

test('formatText: multiple entries joined with newline', () => {
  const errors = [mkErr('a'), mkErr('b')];
  const lines  = formatText(errors).split('\n');
  assert.equal(lines.length, 2);
});

test('formatText: empty input → empty string', () => {
  assert.equal(formatText([]), '');
});

// ── source checks ─────────────────────────────────────────────────────────────

test('BrowserService source imports ErrorFilter', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('ErrorFilter'), 'ErrorFilter import missing');
});

test('BrowserService source includes errorFilter method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('errorFilter'), 'errorFilter method missing');
});

test('BrowserManager source includes error-filter dispatch', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes("case 'error-filter'"), 'error-filter dispatch missing');
});

test('BrowserManager source includes errorFilterOps in capabilities', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes('errorFilterOps'), 'errorFilterOps missing from capabilities');
});
