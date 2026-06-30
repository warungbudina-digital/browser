import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ScrollManager } from '../src/browser/ScrollManager.js';

// ── record ────────────────────────────────────────────────────────────────────

test('record: returns snapshot with x, y, at', () => {
  const mgr  = new ScrollManager();
  const snap = mgr.record(100, 200);
  assert.equal(snap.x, 100);
  assert.equal(snap.y, 200);
  assert.ok(typeof snap.at === 'string');
});

test('record: rounds fractional values', () => {
  const snap = new ScrollManager().record(10.7, 20.3);
  assert.equal(snap.x, 11);
  assert.equal(snap.y, 20);
});

test('record: accepts zero', () => {
  const snap = new ScrollManager().record(0, 0);
  assert.equal(snap.x, 0);
  assert.equal(snap.y, 0);
});

test('record: throws for negative x', () => {
  assert.throws(() => new ScrollManager().record(-1, 0), /x/);
});

test('record: throws for negative y', () => {
  assert.throws(() => new ScrollManager().record(0, -5), /y/);
});

test('record: throws for non-numeric x', () => {
  assert.throws(() => new ScrollManager().record('top', 0), /x/);
});

test('record: throws for NaN', () => {
  assert.throws(() => new ScrollManager().record(NaN, 0), /x/);
});

// ── list ──────────────────────────────────────────────────────────────────────

test('list: returns empty array initially', () => {
  assert.deepEqual(new ScrollManager().list(), []);
});

test('list: returns all snapshots in order', () => {
  const mgr = new ScrollManager();
  mgr.record(0, 0);
  mgr.record(0, 100);
  mgr.record(0, 500);
  assert.equal(mgr.list().length, 3);
  assert.equal(mgr.list()[1].y, 100);
});

test('list: returns copies — mutation safe', () => {
  const mgr  = new ScrollManager();
  mgr.record(50, 100);
  const list = mgr.list();
  list[0].x = 9999;
  assert.equal(mgr.list()[0].x, 50);
});

// ── last ──────────────────────────────────────────────────────────────────────

test('last: returns null when empty', () => {
  assert.equal(new ScrollManager().last(), null);
});

test('last: returns most recent snapshot', () => {
  const mgr = new ScrollManager();
  mgr.record(0, 100);
  mgr.record(0, 500);
  assert.equal(mgr.last().y, 500);
});

test('last: returns copy', () => {
  const mgr  = new ScrollManager();
  mgr.record(10, 20);
  const last = mgr.last();
  last.x = 9999;
  assert.equal(mgr.last().x, 10);
});

// ── diff ──────────────────────────────────────────────────────────────────────

test('diff: calculates dx and dy', () => {
  const mgr = new ScrollManager();
  const a   = mgr.record(0, 100);
  const b   = mgr.record(50, 300);
  assert.deepEqual(mgr.diff(a, b), { dx: 50, dy: 200 });
});

test('diff: negative delta when scrolling up', () => {
  const mgr = new ScrollManager();
  const a   = mgr.record(0, 500);
  const b   = mgr.record(0, 200);
  assert.deepEqual(mgr.diff(a, b), { dx: 0, dy: -300 });
});

// ── summarize ─────────────────────────────────────────────────────────────────

test('summarize: empty returns zero counts and null first/last', () => {
  const s = new ScrollManager().summarize();
  assert.equal(s.count, 0);
  assert.equal(s.first, null);
  assert.equal(s.last,  null);
});

test('summarize: correct maxX, maxY, minX, minY', () => {
  const mgr = new ScrollManager();
  mgr.record(0,   0);
  mgr.record(100, 500);
  mgr.record(50,  200);
  const s = mgr.summarize();
  assert.equal(s.maxX, 100);
  assert.equal(s.maxY, 500);
  assert.equal(s.minX, 0);
  assert.equal(s.minY, 0);
});

test('summarize: count matches size', () => {
  const mgr = new ScrollManager();
  mgr.record(0, 0);
  mgr.record(0, 100);
  assert.equal(mgr.summarize().count, 2);
});

test('summarize: first and last point to correct snapshots', () => {
  const mgr = new ScrollManager();
  mgr.record(0,  10);
  mgr.record(0, 999);
  const s = mgr.summarize();
  assert.equal(s.first.y, 10);
  assert.equal(s.last.y,  999);
});

// ── clear / size ──────────────────────────────────────────────────────────────

test('clear: removes all snapshots', () => {
  const mgr = new ScrollManager();
  mgr.record(0, 100);
  mgr.record(0, 200);
  mgr.clear();
  assert.equal(mgr.size, 0);
  assert.deepEqual(mgr.list(), []);
});

test('size: 0 initially', () => {
  assert.equal(new ScrollManager().size, 0);
});

test('size: increments on record', () => {
  const mgr = new ScrollManager();
  mgr.record(0, 0);
  assert.equal(mgr.size, 1);
  mgr.record(0, 100);
  assert.equal(mgr.size, 2);
});

// ── source checks ─────────────────────────────────────────────────────────────

test('BrowserService imports ScrollManager', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('ScrollManager'), 'ScrollManager import missing');
});

test('BrowserService includes scrollManager instance', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('scrollManager'), 'scrollManager instance missing');
});

test('BrowserService includes scrollTo method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('scrollTo'), 'scrollTo missing');
});

test('BrowserService includes scrollBottom method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('scrollBottom'), 'scrollBottom missing');
});

test('BrowserService includes scrollHistory method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('scrollHistory'), 'scrollHistory missing');
});

test('BrowserManager includes scroll-to dispatch', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes("case 'scroll-to'"), 'scroll-to dispatch missing');
});

test('BrowserManager includes scrollActions in capabilities', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes('scrollActions'), 'scrollActions missing from capabilities');
});
