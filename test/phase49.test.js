import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  filterByOp,
  filterByText,
  filterSince,
  summarize,
} from '../src/browser/ClipboardManager.js';

const h = [
  { op: 'write', text: 'hello world', at: '2026-06-30T10:00:00.000Z' },
  { op: 'read',  text: 'hello world', at: '2026-06-30T10:01:00.000Z' },
  { op: 'write', text: 'foo bar',     at: '2026-06-30T10:02:00.000Z' },
  { op: 'read',  text: '',            at: '2026-06-30T10:03:00.000Z' },
];

// ── filterByOp ────────────────────────────────────────────────────────────────

test('filterByOp: filters write entries', () => {
  const result = filterByOp(h, 'write');
  assert.equal(result.length, 2);
  assert.ok(result.every((e) => e.op === 'write'));
});

test('filterByOp: filters read entries', () => {
  const result = filterByOp(h, 'read');
  assert.equal(result.length, 2);
  assert.ok(result.every((e) => e.op === 'read'));
});

test('filterByOp: unknown op returns empty array', () => {
  assert.deepEqual(filterByOp(h, 'other'), []);
});

test('filterByOp: empty history returns empty array', () => {
  assert.deepEqual(filterByOp([], 'write'), []);
});

// ── filterByText ──────────────────────────────────────────────────────────────

test('filterByText: substring match', () => {
  const result = filterByText(h, 'hello');
  assert.equal(result.length, 2);
});

test('filterByText: RegExp match', () => {
  const result = filterByText(h, /^foo/);
  assert.equal(result.length, 1);
  assert.equal(result[0].text, 'foo bar');
});

test('filterByText: no match returns empty array', () => {
  assert.deepEqual(filterByText(h, 'zzz'), []);
});

test('filterByText: empty string matches all entries', () => {
  assert.equal(filterByText(h, '').length, h.length);
});

// ── filterSince ───────────────────────────────────────────────────────────────

test('filterSince: returns entries at or after given timestamp', () => {
  const result = filterSince(h, '2026-06-30T10:02:00.000Z');
  assert.equal(result.length, 2);
  assert.equal(result[0].text, 'foo bar');
});

test('filterSince: exact match is included', () => {
  const result = filterSince(h, '2026-06-30T10:01:00.000Z');
  assert.equal(result.length, 3);
});

test('filterSince: future timestamp returns empty array', () => {
  assert.deepEqual(filterSince(h, '2030-01-01T00:00:00.000Z'), []);
});

// ── summarize ─────────────────────────────────────────────────────────────────

test('summarize: empty history', () => {
  const s = summarize([]);
  assert.equal(s.count, 0);
  assert.equal(s.reads, 0);
  assert.equal(s.writes, 0);
  assert.equal(s.totalChars, 0);
  assert.equal(s.lastText, null);
});

test('summarize: counts reads and writes correctly', () => {
  const s = summarize(h);
  assert.equal(s.count, 4);
  assert.equal(s.reads, 2);
  assert.equal(s.writes, 2);
});

test('summarize: totalChars is sum of all text lengths', () => {
  const s = summarize(h);
  // 'hello world'(11) + 'hello world'(11) + 'foo bar'(7) + ''(0) = 29
  assert.equal(s.totalChars, 29);
});

test('summarize: lastText is text of final entry', () => {
  assert.equal(summarize(h).lastText, '');
});

test('summarize: single entry', () => {
  const s = summarize([{ op: 'write', text: 'abc', at: '' }]);
  assert.equal(s.count, 1);
  assert.equal(s.writes, 1);
  assert.equal(s.reads, 0);
  assert.equal(s.totalChars, 3);
  assert.equal(s.lastText, 'abc');
});

// ── source checks ─────────────────────────────────────────────────────────────

test('BrowserService imports ClipboardManager', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('ClipboardManager'), 'ClipboardManager import missing');
});

test('BrowserService includes clipboardWrite method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('async clipboardWrite'), 'clipboardWrite missing');
});

test('BrowserService includes clipboardRead method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('async clipboardRead'), 'clipboardRead missing');
});

test('BrowserService includes clipboardGetHistory method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('async clipboardGetHistory'), 'clipboardGetHistory missing');
});

test('BrowserService includes clipboardSummary method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('async clipboardSummary'), 'clipboardSummary missing');
});

test('BrowserManager includes clipboard-write dispatch', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes("case 'clipboard-write'"), 'clipboard-write dispatch missing');
});

test('BrowserManager includes clipboardActions in capabilities', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes('clipboardActions'), 'clipboardActions missing from capabilities');
});
