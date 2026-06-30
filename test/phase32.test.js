import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  WEB_VITALS_THRESHOLDS,
  parseNavigationTiming, parsePaintTiming,
  scoreMetric, mergeMetrics, formatMetrics,
} from '../src/browser/PageMetrics.js';

// Helper — build a minimal navigation timing entry
const mkNav = (overrides = {}) => ({
  fetchStart:               0,
  domainLookupStart:        5,
  domainLookupEnd:          10,
  connectStart:             10,
  connectEnd:               30,
  requestStart:             30,
  responseStart:            80,  // ttfb = 80 - 0 = 80ms
  responseEnd:              150,
  domContentLoadedEventEnd: 300,
  loadEventEnd:             500,
  redirectCount:            0,
  type:                     'navigate',
  ...overrides,
});

// ── WEB_VITALS_THRESHOLDS ─────────────────────────────────────────────────────

test('WEB_VITALS_THRESHOLDS: is an object', () => {
  assert.equal(typeof WEB_VITALS_THRESHOLDS, 'object');
});

test('WEB_VITALS_THRESHOLDS: has entries for ttfb, fcp, lcp, cls', () => {
  for (const key of ['ttfb', 'fcp', 'lcp', 'cls']) {
    assert.ok(key in WEB_VITALS_THRESHOLDS, `missing: ${key}`);
  }
});

test('WEB_VITALS_THRESHOLDS: each entry has good and poor fields', () => {
  for (const [key, t] of Object.entries(WEB_VITALS_THRESHOLDS)) {
    assert.ok('good' in t, `${key} missing good`);
    assert.ok('poor' in t, `${key} missing poor`);
    assert.ok(t.good < t.poor, `${key}: good should be lower than poor`);
  }
});

// ── parseNavigationTiming ─────────────────────────────────────────────────────

test('parseNavigationTiming: computes ttfb = responseStart - fetchStart', () => {
  const m = parseNavigationTiming(mkNav({ fetchStart: 0, responseStart: 200 }));
  assert.equal(m.ttfb, 200);
});

test('parseNavigationTiming: computes dnsLookup = domainLookupEnd - domainLookupStart', () => {
  const m = parseNavigationTiming(mkNav({ domainLookupStart: 5, domainLookupEnd: 20 }));
  assert.equal(m.dnsLookup, 15);
});

test('parseNavigationTiming: computes tcpConnect = connectEnd - connectStart', () => {
  const m = parseNavigationTiming(mkNav({ connectStart: 10, connectEnd: 40 }));
  assert.equal(m.tcpConnect, 30);
});

test('parseNavigationTiming: computes requestDuration = responseEnd - requestStart', () => {
  const m = parseNavigationTiming(mkNav({ requestStart: 30, responseEnd: 180 }));
  assert.equal(m.requestDuration, 150);
});

test('parseNavigationTiming: computes domContentLoaded relative to fetchStart', () => {
  const m = parseNavigationTiming(mkNav({ fetchStart: 10, domContentLoadedEventEnd: 310 }));
  assert.equal(m.domContentLoaded, 300);
});

test('parseNavigationTiming: computes pageLoad relative to fetchStart', () => {
  const m = parseNavigationTiming(mkNav({ fetchStart: 0, loadEventEnd: 500 }));
  assert.equal(m.pageLoad, 500);
});

test('parseNavigationTiming: includes redirectCount and navigationType', () => {
  const m = parseNavigationTiming(mkNav({ redirectCount: 2, type: 'reload' }));
  assert.equal(m.redirectCount,   2);
  assert.equal(m.navigationType, 'reload');
});

test('parseNavigationTiming: handles missing fields with 0 defaults', () => {
  const m = parseNavigationTiming({});
  assert.equal(m.ttfb,    0);
  assert.equal(m.pageLoad, 0);
  assert.equal(m.redirectCount, 0);
  assert.equal(m.navigationType, 'navigate');
});

// ── parsePaintTiming ──────────────────────────────────────────────────────────

test('parsePaintTiming: extracts firstPaint', () => {
  const entries = [{ name: 'first-paint', startTime: 120 }];
  assert.equal(parsePaintTiming(entries).firstPaint, 120);
});

test('parsePaintTiming: extracts firstContentfulPaint', () => {
  const entries = [{ name: 'first-contentful-paint', startTime: 250 }];
  assert.equal(parsePaintTiming(entries).firstContentfulPaint, 250);
});

test('parsePaintTiming: null when entry not present', () => {
  const result = parsePaintTiming([{ name: 'first-paint', startTime: 100 }]);
  assert.equal(result.firstContentfulPaint, null);
});

test('parsePaintTiming: empty array → both null', () => {
  const result = parsePaintTiming([]);
  assert.equal(result.firstPaint,            null);
  assert.equal(result.firstContentfulPaint,  null);
});

test('parsePaintTiming: null/undefined input → both null', () => {
  const result = parsePaintTiming(null);
  assert.equal(result.firstPaint, null);
});

// ── scoreMetric ───────────────────────────────────────────────────────────────

test('scoreMetric: "good" when value <= good threshold', () => {
  assert.equal(scoreMetric('ttfb', 500),  'good');
  assert.equal(scoreMetric('ttfb', 800),  'good');   // boundary
});

test('scoreMetric: "needs-improvement" when between thresholds', () => {
  assert.equal(scoreMetric('ttfb', 801),  'needs-improvement');
  assert.equal(scoreMetric('ttfb', 1800), 'needs-improvement');  // boundary
});

test('scoreMetric: "poor" when value > poor threshold', () => {
  assert.equal(scoreMetric('ttfb', 1801), 'poor');
});

test('scoreMetric: "unknown" for unrecognized metric name', () => {
  assert.equal(scoreMetric('bananas', 100), 'unknown');
});

test('scoreMetric: works for CLS (unitless)', () => {
  assert.equal(scoreMetric('cls', 0.05), 'good');
  assert.equal(scoreMetric('cls', 0.15), 'needs-improvement');
  assert.equal(scoreMetric('cls', 0.30), 'poor');
});

// ── mergeMetrics ──────────────────────────────────────────────────────────────

test('mergeMetrics: combines navigation and paint results', () => {
  const nav   = parseNavigationTiming(mkNav());
  const paint = parsePaintTiming([
    { name: 'first-paint', startTime: 120 },
    { name: 'first-contentful-paint', startTime: 200 },
  ]);
  const m = mergeMetrics(nav, paint);
  assert.ok('ttfb' in m);
  assert.equal(m.fp,  120);
  assert.equal(m.fcp, 200);
});

test('mergeMetrics: null paint values included', () => {
  const nav   = parseNavigationTiming(mkNav());
  const paint = parsePaintTiming([]);
  const m     = mergeMetrics(nav, paint);
  assert.equal(m.fp,  null);
  assert.equal(m.fcp, null);
});

// ── formatMetrics ─────────────────────────────────────────────────────────────

test('formatMetrics: includes label in output', () => {
  const text = formatMetrics({ ttfb: 100 }, { label: 'My Page' });
  assert.ok(text.includes('My Page'));
});

test('formatMetrics: includes metric names in output', () => {
  const text = formatMetrics({ ttfb: 100, pageLoad: 500 });
  assert.ok(text.includes('ttfb'));
  assert.ok(text.includes('pageLoad'));
});

test('formatMetrics: includes score for known vitals', () => {
  const text = formatMetrics({ ttfb: 500 });
  assert.ok(text.includes('[good]'), `expected [good] in: ${text}`);
});

test('formatMetrics: skips null values', () => {
  const text = formatMetrics({ fcp: null, ttfb: 200 });
  assert.ok(!text.includes('fcp'), 'null fcp should be skipped');
  assert.ok(text.includes('ttfb'));
});

test('formatMetrics: non-vital metrics have no score annotation', () => {
  const text = formatMetrics({ pageLoad: 1000 });
  assert.ok(text.includes('pageLoad'));
  assert.ok(!text.includes('[good]') && !text.includes('[poor]'), 'non-vital should have no score');
});

// ── source checks ─────────────────────────────────────────────────────────────

test('BrowserService source imports PageMetrics', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('PageMetrics'), 'PageMetrics import missing');
});

test('BrowserService source includes pageMetrics method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('pageMetrics'), 'pageMetrics method missing');
});

test('BrowserManager source includes page-metrics dispatch', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes("case 'page-metrics'"), 'page-metrics dispatch missing');
});

test('BrowserManager source includes metricsActions in capabilities', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes('metricsActions'), 'metricsActions missing from capabilities');
});
