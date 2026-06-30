import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  VALID_LEVELS,
  filterByLevel, filterByPattern, filterSince, filterBefore,
  groupByLevel, summarize, formatText,
} from '../src/browser/ConsoleFilter.js';

// Helper — build a log entry
const mkEntry = (level, text, at = '2024-01-01T00:00:00.000Z') => ({ level, text, at });

// ── VALID_LEVELS ──────────────────────────────────────────────────────────────

test('VALID_LEVELS: is a Set', () => {
  assert.ok(VALID_LEVELS instanceof Set);
});

test('VALID_LEVELS: contains standard levels', () => {
  for (const l of ['log', 'info', 'warn', 'error', 'debug']) {
    assert.ok(VALID_LEVELS.has(l), `missing: ${l}`);
  }
});

// ── filterByLevel ─────────────────────────────────────────────────────────────

test('filterByLevel: filters by single level string', () => {
  const entries = [mkEntry('error', 'bad'), mkEntry('info', 'ok'), mkEntry('error', 'oops')];
  const result  = filterByLevel(entries, 'error');
  assert.equal(result.length, 2);
  assert.ok(result.every((e) => e.level === 'error'));
});

test('filterByLevel: filters by array of levels', () => {
  const entries = [mkEntry('error', 'e'), mkEntry('warn', 'w'), mkEntry('info', 'i'), mkEntry('log', 'l')];
  const result  = filterByLevel(entries, ['error', 'warn']);
  assert.equal(result.length, 2);
});

test('filterByLevel: returns empty when no match', () => {
  assert.equal(filterByLevel([mkEntry('info', 'x')], 'error').length, 0);
});

test('filterByLevel: returns copies — mutation safe', () => {
  const entries = [mkEntry('log', 'hi')];
  const result  = filterByLevel(entries, 'log');
  result[0].text = 'mutated';
  assert.equal(entries[0].text, 'hi');
});

// ── filterByPattern ───────────────────────────────────────────────────────────

test('filterByPattern: string does substring match', () => {
  const entries = [mkEntry('log', 'hello world'), mkEntry('log', 'goodbye'), mkEntry('log', 'hello there')];
  assert.equal(filterByPattern(entries, 'hello').length, 2);
});

test('filterByPattern: RegExp match', () => {
  const entries = [mkEntry('log', 'Error: timeout'), mkEntry('log', 'Error: 404'), mkEntry('log', 'success')];
  assert.equal(filterByPattern(entries, /^Error/).length, 2);
});

test('filterByPattern: returns empty when no match', () => {
  assert.equal(filterByPattern([mkEntry('log', 'foo')], 'bar').length, 0);
});

test('filterByPattern: returns copies — mutation safe', () => {
  const entries = [mkEntry('log', 'test')];
  const result  = filterByPattern(entries, 'test');
  result[0].text = 'changed';
  assert.equal(entries[0].text, 'test');
});

// ── filterSince ───────────────────────────────────────────────────────────────

test('filterSince: returns entries at or after given ISO', () => {
  const entries = [
    mkEntry('log', 'a', '2024-01-01T00:00:00.000Z'),
    mkEntry('log', 'b', '2024-01-02T00:00:00.000Z'),
    mkEntry('log', 'c', '2024-01-03T00:00:00.000Z'),
  ];
  const result = filterSince(entries, '2024-01-02T00:00:00.000Z');
  assert.equal(result.length, 2);
  assert.ok(result.every((e) => e.at >= '2024-01-02T00:00:00.000Z'));
});

test('filterSince: boundary is inclusive', () => {
  const entries = [mkEntry('log', 'exact', '2024-06-01T12:00:00.000Z')];
  assert.equal(filterSince(entries, '2024-06-01T12:00:00.000Z').length, 1);
});

test('filterSince: returns empty when all entries are before', () => {
  const entries = [mkEntry('log', 'old', '2024-01-01T00:00:00.000Z')];
  assert.equal(filterSince(entries, '2025-01-01T00:00:00.000Z').length, 0);
});

// ── filterBefore ──────────────────────────────────────────────────────────────

test('filterBefore: returns entries strictly before given ISO', () => {
  const entries = [
    mkEntry('log', 'a', '2024-01-01T00:00:00.000Z'),
    mkEntry('log', 'b', '2024-01-02T00:00:00.000Z'),
    mkEntry('log', 'c', '2024-01-03T00:00:00.000Z'),
  ];
  const result = filterBefore(entries, '2024-01-03T00:00:00.000Z');
  assert.equal(result.length, 2);
});

test('filterBefore: boundary is exclusive', () => {
  const entries = [mkEntry('log', 'exact', '2024-06-01T12:00:00.000Z')];
  assert.equal(filterBefore(entries, '2024-06-01T12:00:00.000Z').length, 0);
});

// ── groupByLevel ──────────────────────────────────────────────────────────────

test('groupByLevel: groups entries by level', () => {
  const entries = [
    mkEntry('error', 'e1'), mkEntry('error', 'e2'),
    mkEntry('warn',  'w1'),
    mkEntry('info',  'i1'),
  ];
  const groups = groupByLevel(entries);
  assert.equal(groups.error.length, 2);
  assert.equal(groups.warn.length,  1);
  assert.equal(groups.info.length,  1);
});

test('groupByLevel: returns empty object for empty input', () => {
  assert.deepEqual(groupByLevel([]), {});
});

test('groupByLevel: copies entries — mutation safe', () => {
  const entries = [mkEntry('log', 'hi')];
  const groups  = groupByLevel(entries);
  groups.log[0].text = 'changed';
  assert.equal(entries[0].text, 'hi');
});

// ── summarize ─────────────────────────────────────────────────────────────────

test('summarize: counts total entries', () => {
  const entries = [mkEntry('log', 'a'), mkEntry('error', 'b'), mkEntry('log', 'c')];
  assert.equal(summarize(entries).total, 3);
});

test('summarize: counts per level', () => {
  const entries = [mkEntry('log', 'a'), mkEntry('error', 'b'), mkEntry('log', 'c')];
  const s = summarize(entries);
  assert.equal(s.byLevel.log,   2);
  assert.equal(s.byLevel.error, 1);
});

test('summarize: identifies first and last timestamps', () => {
  const entries = [
    mkEntry('log', 'a', '2024-01-02T00:00:00.000Z'),
    mkEntry('log', 'b', '2024-01-01T00:00:00.000Z'),
    mkEntry('log', 'c', '2024-01-03T00:00:00.000Z'),
  ];
  const s = summarize(entries);
  assert.equal(s.first, '2024-01-01T00:00:00.000Z');
  assert.equal(s.last,  '2024-01-03T00:00:00.000Z');
});

test('summarize: empty entries → total 0 and null timestamps', () => {
  const s = summarize([]);
  assert.equal(s.total, 0);
  assert.equal(s.first, null);
  assert.equal(s.last,  null);
});

// ── formatText ────────────────────────────────────────────────────────────────

test('formatText: formats each entry as [LEVEL] text', () => {
  const entries = [mkEntry('error', 'something broke')];
  const text    = formatText(entries);
  assert.ok(text.includes('[ERROR]'));
  assert.ok(text.includes('something broke'));
});

test('formatText: includes time when timestamps=true', () => {
  const entries = [mkEntry('log', 'hi', '2024-06-15T10:30:45.000Z')];
  const text    = formatText(entries, { timestamps: true });
  assert.ok(text.includes('10:30:45'), `expected time in: ${text}`);
});

test('formatText: multiple entries joined with newline', () => {
  const entries = [mkEntry('log', 'a'), mkEntry('error', 'b')];
  const lines   = formatText(entries).split('\n');
  assert.equal(lines.length, 2);
});

test('formatText: empty entries → empty string', () => {
  assert.equal(formatText([]), '');
});

// ── source checks ─────────────────────────────────────────────────────────────

test('BrowserService source imports ConsoleFilter', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('ConsoleFilter'), 'ConsoleFilter import missing');
});

test('BrowserService source includes consoleFilter method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('consoleFilter'), 'consoleFilter method missing');
});

test('BrowserManager source includes console-filter dispatch', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes("case 'console-filter'"), 'console-filter dispatch missing');
});

test('BrowserManager source includes consoleFilterOps in capabilities', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes('consoleFilterOps'), 'consoleFilterOps missing from capabilities');
});
