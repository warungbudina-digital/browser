import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  filterByUrl, filterByTitle,
  filterSince, filterBefore,
  deduplicateConsecutive, groupByUrl,
  summarize, formatText,
} from '../src/browser/NavigationTracker.js';

// helper
const nav = (url, title, at) => ({ url, title: title ?? '', at: at ?? new Date().toISOString() });

// ── filterByUrl ───────────────────────────────────────────────────────────────

test('filterByUrl: string substring match', () => {
  const entries = [nav('https://example.com/page'), nav('https://other.com/')];
  assert.equal(filterByUrl(entries, 'example.com').length, 1);
});

test('filterByUrl: RegExp match', () => {
  const entries = [nav('https://api.example.com/'), nav('https://other.com/')];
  assert.equal(filterByUrl(entries, /example/).length, 1);
});

test('filterByUrl: no match returns empty', () => {
  assert.deepEqual(filterByUrl([nav('https://x.com/')], 'notfound'), []);
});

// ── filterByTitle ─────────────────────────────────────────────────────────────

test('filterByTitle: string substring match', () => {
  const entries = [nav('https://a.com', 'Home Page'), nav('https://b.com', 'About Us')];
  assert.equal(filterByTitle(entries, 'Home').length, 1);
});

test('filterByTitle: case-insensitive', () => {
  const entries = [nav('https://a.com', 'HOME PAGE')];
  assert.equal(filterByTitle(entries, 'home page').length, 1);
});

test('filterByTitle: RegExp match', () => {
  const entries = [nav('https://a.com', 'Error 404'), nav('https://b.com', 'OK')];
  assert.equal(filterByTitle(entries, /Error \d+/).length, 1);
});

// ── filterSince / filterBefore ────────────────────────────────────────────────

test('filterSince: keeps entries at or after iso', () => {
  const t1 = '2024-01-01T10:00:00.000Z';
  const t2 = '2024-01-01T11:00:00.000Z';
  const t3 = '2024-01-01T12:00:00.000Z';
  const entries = [nav('a', '', t1), nav('b', '', t2), nav('c', '', t3)];
  assert.equal(filterSince(entries, t2).length, 2);
});

test('filterBefore: keeps entries before iso', () => {
  const t1 = '2024-01-01T10:00:00.000Z';
  const t2 = '2024-01-01T11:00:00.000Z';
  const t3 = '2024-01-01T12:00:00.000Z';
  const entries = [nav('a', '', t1), nav('b', '', t2), nav('c', '', t3)];
  assert.equal(filterBefore(entries, t2).length, 1);
  assert.equal(filterBefore(entries, t2)[0].url, 'a');
});

// ── deduplicateConsecutive ────────────────────────────────────────────────────

test('deduplicateConsecutive: collapses consecutive same URLs', () => {
  const entries = [
    nav('https://a.com/'),
    nav('https://a.com/'),
    nav('https://b.com/'),
    nav('https://b.com/'),
    nav('https://a.com/'),
  ];
  const result = deduplicateConsecutive(entries);
  assert.equal(result.length, 3);
  assert.equal(result[0].url, 'https://a.com/');
  assert.equal(result[1].url, 'https://b.com/');
  assert.equal(result[2].url, 'https://a.com/');
});

test('deduplicateConsecutive: empty input returns empty', () => {
  assert.deepEqual(deduplicateConsecutive([]), []);
});

test('deduplicateConsecutive: no duplicates unchanged', () => {
  const entries = [nav('https://a.com/'), nav('https://b.com/')];
  assert.equal(deduplicateConsecutive(entries).length, 2);
});

// ── groupByUrl ────────────────────────────────────────────────────────────────

test('groupByUrl: groups by URL', () => {
  const entries = [
    nav('https://a.com/', 'A', '2024-01-01T10:00:00Z'),
    nav('https://b.com/', 'B', '2024-01-01T11:00:00Z'),
    nav('https://a.com/', 'A2', '2024-01-01T12:00:00Z'),
  ];
  const groups = groupByUrl(entries);
  assert.equal(groups['https://a.com/'].length, 2);
  assert.equal(groups['https://b.com/'].length, 1);
});

test('groupByUrl: empty returns empty object', () => {
  assert.deepEqual(groupByUrl([]), {});
});

// ── summarize ─────────────────────────────────────────────────────────────────

test('summarize: correct total and uniqueUrls', () => {
  const entries = [
    nav('https://a.com/'),
    nav('https://b.com/'),
    nav('https://a.com/'),
  ];
  const s = summarize(entries);
  assert.equal(s.total, 3);
  assert.equal(s.uniqueUrls.length, 2);
});

test('summarize: first and last null for empty', () => {
  const s = summarize([]);
  assert.equal(s.total, 0);
  assert.equal(s.first, null);
  assert.equal(s.last,  null);
});

test('summarize: first and last correct', () => {
  const t1 = '2024-01-01T10:00:00Z';
  const t2 = '2024-01-01T12:00:00Z';
  const entries = [nav('https://first.com/', 'First', t1), nav('https://last.com/', 'Last', t2)];
  const s = summarize(entries);
  assert.equal(s.first.url, 'https://first.com/');
  assert.equal(s.last.url,  'https://last.com/');
});

// ── formatText ────────────────────────────────────────────────────────────────

test('formatText: includes title and url when title exists', () => {
  const result = formatText([nav('https://a.com/', 'Home')]);
  assert.ok(result.includes('Home'));
  assert.ok(result.includes('https://a.com/'));
});

test('formatText: shows only url when title is empty', () => {
  const result = formatText([nav('https://a.com/', '')]);
  assert.equal(result, 'https://a.com/');
});

test('formatText: timestamps=true includes HH:MM:SS', () => {
  const at = '2024-06-15T10:30:00.000Z';
  const result = formatText([nav('https://a.com/', 'Page', at)], { timestamps: true });
  assert.ok(result.includes('['));
  assert.ok(result.includes(':'));
});

test('formatText: multiple entries separated by newlines', () => {
  const entries = [nav('https://a.com/'), nav('https://b.com/')];
  assert.equal(formatText(entries).split('\n').length, 2);
});

test('formatText: empty returns empty string', () => {
  assert.equal(formatText([]), '');
});

// ── source checks ─────────────────────────────────────────────────────────────

test('BrowserService imports NavigationTracker', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('NavigationTracker'), 'NavigationTracker import missing');
});

test('BrowserService logs store includes navigation array', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('navigation: []'), 'navigation array missing from logs store');
});

test('BrowserService attaches framenavigated listener', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes("'framenavigated'"), 'framenavigated listener missing');
});

test('BrowserService includes navHistory method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('navHistory'), 'navHistory missing');
});

test('BrowserService includes navSummary method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('navSummary'), 'navSummary missing');
});

test('BrowserManager includes nav-history dispatch', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes("case 'nav-history'"), 'nav-history dispatch missing');
});

test('BrowserManager includes navActions in capabilities', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes('navActions'), 'navActions missing from capabilities');
});
