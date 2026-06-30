import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  VALID_FRAME_TYPES,
  filterByType, filterByUrl, filterByData,
  filterSince, filterBefore,
  groupByUrl, summarize, formatText,
} from '../src/browser/WebSocketMonitor.js';

// helpers
const frame = (type, url, data, at) => ({ type, url, data, at: at ?? new Date().toISOString() });
const send    = (url, data, at) => frame('send',    url, data, at);
const receive = (url, data, at) => frame('receive', url, data, at);

// ── VALID_FRAME_TYPES ─────────────────────────────────────────────────────────

test('VALID_FRAME_TYPES contains send and receive', () => {
  assert.ok(VALID_FRAME_TYPES.has('send'));
  assert.ok(VALID_FRAME_TYPES.has('receive'));
});

// ── filterByType ──────────────────────────────────────────────────────────────

test('filterByType: keeps only send frames', () => {
  const frames = [send('ws://a', 'hi'), receive('ws://a', 'hey')];
  const result = filterByType(frames, 'send');
  assert.equal(result.length, 1);
  assert.equal(result[0].type, 'send');
});

test('filterByType: keeps only receive frames', () => {
  const frames = [send('ws://a', 'hi'), receive('ws://a', 'hey'), receive('ws://b', 'yo')];
  const result = filterByType(frames, 'receive');
  assert.equal(result.length, 2);
});

test('filterByType: throws for invalid type', () => {
  assert.throws(() => filterByType([], 'unknown'), /Invalid type/);
});

test('filterByType: empty input returns empty', () => {
  assert.deepEqual(filterByType([], 'send'), []);
});

// ── filterByUrl ───────────────────────────────────────────────────────────────

test('filterByUrl: string substring match', () => {
  const frames = [
    send('ws://api.example.com/chat', 'hi'),
    send('ws://other.com/feed',       'yo'),
  ];
  assert.equal(filterByUrl(frames, 'example.com').length, 1);
});

test('filterByUrl: RegExp match', () => {
  const frames = [
    send('ws://api.example.com/chat', 'hi'),
    send('ws://other.com/feed',       'yo'),
  ];
  assert.equal(filterByUrl(frames, /example/).length, 1);
});

test('filterByUrl: no match returns empty', () => {
  const frames = [send('ws://api.example.com', 'hi')];
  assert.deepEqual(filterByUrl(frames, 'notfound'), []);
});

// ── filterByData ──────────────────────────────────────────────────────────────

test('filterByData: string substring match', () => {
  const frames = [send('ws://a', '{"action":"ping"}'), receive('ws://a', '{"action":"pong"}')];
  assert.equal(filterByData(frames, '"action":"ping"').length, 1);
});

test('filterByData: RegExp match', () => {
  const frames = [send('ws://a', 'hello world'), receive('ws://a', 'bye')];
  assert.equal(filterByData(frames, /^hello/).length, 1);
});

// ── filterSince / filterBefore ────────────────────────────────────────────────

test('filterSince: keeps frames at or after iso', () => {
  const t1 = '2024-01-01T10:00:00.000Z';
  const t2 = '2024-01-01T11:00:00.000Z';
  const t3 = '2024-01-01T12:00:00.000Z';
  const frames = [send('ws://a', 'a', t1), send('ws://a', 'b', t2), send('ws://a', 'c', t3)];
  const result = filterSince(frames, t2);
  assert.equal(result.length, 2);
  assert.ok(result.every((f) => new Date(f.at) >= new Date(t2)));
});

test('filterBefore: keeps frames before iso', () => {
  const t1 = '2024-01-01T10:00:00.000Z';
  const t2 = '2024-01-01T11:00:00.000Z';
  const t3 = '2024-01-01T12:00:00.000Z';
  const frames = [send('ws://a', 'a', t1), send('ws://a', 'b', t2), send('ws://a', 'c', t3)];
  const result = filterBefore(frames, t2);
  assert.equal(result.length, 1);
  assert.equal(result[0].data, 'a');
});

// ── groupByUrl ────────────────────────────────────────────────────────────────

test('groupByUrl: groups frames by url', () => {
  const frames = [
    send('ws://a.com', 'x'),
    receive('ws://b.com', 'y'),
    send('ws://a.com', 'z'),
  ];
  const groups = groupByUrl(frames);
  assert.equal(groups['ws://a.com'].length, 2);
  assert.equal(groups['ws://b.com'].length, 1);
});

test('groupByUrl: empty input returns empty object', () => {
  assert.deepEqual(groupByUrl([]), {});
});

// ── summarize ─────────────────────────────────────────────────────────────────

test('summarize: counts total, sent, received', () => {
  const frames = [send('ws://a', 'x'), send('ws://a', 'y'), receive('ws://a', 'z')];
  const s = summarize(frames);
  assert.equal(s.total,    3);
  assert.equal(s.sent,     2);
  assert.equal(s.received, 1);
});

test('summarize: lists unique urls', () => {
  const frames = [send('ws://a', 'x'), receive('ws://b', 'y'), send('ws://a', 'z')];
  const s = summarize(frames);
  assert.equal(s.urls.length, 2);
  assert.ok(s.urls.includes('ws://a'));
  assert.ok(s.urls.includes('ws://b'));
});

test('summarize: first and last are null for empty', () => {
  const s = summarize([]);
  assert.equal(s.first, null);
  assert.equal(s.last,  null);
  assert.equal(s.total, 0);
});

test('summarize: first and last point to correct frames', () => {
  const t1 = '2024-01-01T10:00:00.000Z';
  const t2 = '2024-01-01T12:00:00.000Z';
  const frames = [send('ws://a', 'first', t1), receive('ws://a', 'last', t2)];
  const s = summarize(frames);
  assert.equal(s.first.data, 'first');
  assert.equal(s.last.data,  'last');
});

// ── formatText ────────────────────────────────────────────────────────────────

test('formatText: send uses → arrow', () => {
  const result = formatText([send('ws://a', 'hello')]);
  assert.ok(result.includes('→ hello'));
});

test('formatText: receive uses ← arrow', () => {
  const result = formatText([receive('ws://a', 'world')]);
  assert.ok(result.includes('← world'));
});

test('formatText: timestamps=true includes HH:MM:SS', () => {
  const at = '2024-06-15T10:30:45.000Z';
  const result = formatText([send('ws://a', 'msg', at)], { timestamps: true });
  assert.ok(result.includes('['));
  assert.ok(result.includes(':'));
  assert.ok(result.includes('→ msg'));
});

test('formatText: no timestamps by default', () => {
  const result = formatText([send('ws://a', 'hi')], { timestamps: false });
  assert.ok(!result.startsWith('['));
});

test('formatText: multiple frames separated by newlines', () => {
  const frames = [send('ws://a', 'a'), receive('ws://a', 'b')];
  const lines  = formatText(frames).split('\n');
  assert.equal(lines.length, 2);
});

test('formatText: empty input returns empty string', () => {
  assert.equal(formatText([]), '');
});

// ── source checks ─────────────────────────────────────────────────────────────

test('BrowserService imports WebSocketMonitor', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('WebSocketMonitor'), 'WebSocketMonitor import missing');
});

test('BrowserService logs store includes ws array', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes("ws: []"), 'ws array missing from logs store');
});

test('BrowserService attaches websocket listener', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes("'websocket'"), 'websocket listener missing');
});

test('BrowserService includes wsFilter method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('wsFilter'), 'wsFilter method missing');
});

test('BrowserService includes wsSummary method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('wsSummary'), 'wsSummary method missing');
});

test('BrowserManager includes ws-filter dispatch', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes("case 'ws-filter'"), 'ws-filter dispatch missing');
});

test('BrowserManager includes wsActions in capabilities', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes('wsActions'), 'wsActions missing from capabilities');
});
