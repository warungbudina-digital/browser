import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  filterByTag,
  filterByState,
  filterMuted,
  summarize,
} from '../src/browser/MediaPlayerManager.js';

const elements = [
  { tag: 'video', index: 0, src: 'https://example.com/a.mp4', currentTime: 10, duration: 120, paused: false, ended: false, muted: false, volume: 1.0, readyState: 4 },
  { tag: 'audio', index: 1, src: 'https://example.com/b.mp3', currentTime: 0,  duration: 200, paused: true,  ended: false, muted: true,  volume: 0.5, readyState: 3 },
  { tag: 'video', index: 2, src: 'https://example.com/c.mp4', currentTime: 60, duration: 60,  paused: false, ended: true,  muted: false, volume: 0.8, readyState: 4 },
  { tag: 'audio', index: 3, src: 'https://example.com/d.mp3', currentTime: 5,  duration: 90,  paused: true,  ended: false, muted: false, volume: 1.0, readyState: 2 },
];

// ── filterByTag ───────────────────────────────────────────────────────────────

test('filterByTag: video only', () => {
  const result = filterByTag(elements, 'video');
  assert.equal(result.length, 2);
  assert.ok(result.every((e) => e.tag === 'video'));
});

test('filterByTag: audio only', () => {
  const result = filterByTag(elements, 'audio');
  assert.equal(result.length, 2);
  assert.ok(result.every((e) => e.tag === 'audio'));
});

test('filterByTag: unknown tag returns empty array', () => {
  assert.deepEqual(filterByTag(elements, 'img'), []);
});

test('filterByTag: empty input returns empty array', () => {
  assert.deepEqual(filterByTag([], 'video'), []);
});

// ── filterByState ─────────────────────────────────────────────────────────────

test('filterByState: playing (not paused, not ended)', () => {
  const result = filterByState(elements, 'playing');
  assert.equal(result.length, 1);
  assert.equal(result[0].src, 'https://example.com/a.mp4');
});

test('filterByState: paused (paused and not ended)', () => {
  const result = filterByState(elements, 'paused');
  assert.equal(result.length, 2);
  assert.ok(result.every((e) => e.paused && !e.ended));
});

test('filterByState: ended', () => {
  const result = filterByState(elements, 'ended');
  assert.equal(result.length, 1);
  assert.ok(result[0].ended);
});

test('filterByState: unknown state returns empty array', () => {
  assert.deepEqual(filterByState(elements, 'buffering'), []);
});

// ── filterMuted ───────────────────────────────────────────────────────────────

test('filterMuted: returns only muted elements', () => {
  const result = filterMuted(elements);
  assert.equal(result.length, 1);
  assert.ok(result[0].muted);
});

test('filterMuted: all unmuted returns empty array', () => {
  const unmuted = elements.map((e) => ({ ...e, muted: false }));
  assert.deepEqual(filterMuted(unmuted), []);
});

test('filterMuted: empty input returns empty array', () => {
  assert.deepEqual(filterMuted([]), []);
});

// ── summarize ─────────────────────────────────────────────────────────────────

test('summarize: total equals element count', () => {
  assert.equal(summarize(elements).total, 4);
});

test('summarize: audio and video counts', () => {
  const s = summarize(elements);
  assert.equal(s.audio, 2);
  assert.equal(s.video, 2);
});

test('summarize: playing count (not paused, not ended)', () => {
  assert.equal(summarize(elements).playing, 1);
});

test('summarize: paused count', () => {
  assert.equal(summarize(elements).paused, 2);
});

test('summarize: ended count', () => {
  assert.equal(summarize(elements).ended, 1);
});

test('summarize: muted count', () => {
  assert.equal(summarize(elements).muted, 1);
});

test('summarize: empty elements returns zeros', () => {
  const s = summarize([]);
  assert.equal(s.total, 0);
  assert.equal(s.playing, 0);
  assert.equal(s.audio, 0);
  assert.equal(s.video, 0);
});

// ── source checks ─────────────────────────────────────────────────────────────

test('BrowserService imports MediaPlayerManager', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('MediaPlayerManager'), 'MediaPlayerManager import missing');
});

test('BrowserService includes playerList method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('async playerList'), 'playerList missing');
});

test('BrowserService includes playerPlay method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('async playerPlay'), 'playerPlay missing');
});

test('BrowserService includes playerPause method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('async playerPause'), 'playerPause missing');
});

test('BrowserService includes playerSeek method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('async playerSeek'), 'playerSeek missing');
});

test('BrowserService includes playerMute method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('async playerMute'), 'playerMute missing');
});

test('BrowserService includes playerVolume method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('async playerVolume'), 'playerVolume missing');
});

test('BrowserManager includes player-list dispatch', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes("case 'player-list'"), 'player-list dispatch missing');
});

test('BrowserManager includes playerActions in capabilities', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes('playerActions'), 'playerActions missing from capabilities');
});
