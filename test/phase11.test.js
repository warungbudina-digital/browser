import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  serialize,
  contentType,
  filename,
  EXPORT_FORMATS,
  EXPORT_TYPES,
  MAX_EXPORT_ROWS,
} from '../src/scraper/Exporter.js';

// ── Constants ─────────────────────────────────────────────────────────────────

test('EXPORT_FORMATS contains json, csv, ndjson', () => {
  assert.ok(EXPORT_FORMATS.includes('json'));
  assert.ok(EXPORT_FORMATS.includes('csv'));
  assert.ok(EXPORT_FORMATS.includes('ndjson'));
});

test('EXPORT_TYPES contains posts, profiles, jobs', () => {
  assert.ok(EXPORT_TYPES.includes('posts'));
  assert.ok(EXPORT_TYPES.includes('profiles'));
  assert.ok(EXPORT_TYPES.includes('jobs'));
});

test('MAX_EXPORT_ROWS is at least 1000', () => {
  assert.ok(MAX_EXPORT_ROWS >= 1000);
});

// ── serialize — JSON ──────────────────────────────────────────────────────────

test('serialize json: wraps array in { data, total }', () => {
  const rows = [{ id: '1', platform: 'instagram' }, { id: '2', platform: 'tiktok' }];
  const out  = JSON.parse(serialize(rows, 'json'));
  assert.equal(out.total, 2);
  assert.deepEqual(out.data, rows);
});

test('serialize json: empty array returns { data: [], total: 0 }', () => {
  const out = JSON.parse(serialize([], 'json'));
  assert.equal(out.total, 0);
  assert.deepEqual(out.data, []);
});

test('serialize json: uses custom dataKey', () => {
  const out = JSON.parse(serialize([{ x: 1 }], 'json', 'posts'));
  assert.ok(Array.isArray(out.posts));
  assert.equal(out.total, 1);
});

// ── serialize — NDJSON ────────────────────────────────────────────────────────

test('serialize ndjson: one JSON object per line', () => {
  const rows = [{ id: '1', name: 'a' }, { id: '2', name: 'b' }];
  const out  = serialize(rows, 'ndjson');
  const lines = out.trim().split('\n');
  assert.equal(lines.length, 2);
  assert.deepEqual(JSON.parse(lines[0]), { id: '1', name: 'a' });
  assert.deepEqual(JSON.parse(lines[1]), { id: '2', name: 'b' });
});

test('serialize ndjson: empty array returns empty string', () => {
  assert.equal(serialize([], 'ndjson'), '');
});

test('serialize ndjson: array fields are flattened with pipe separator', () => {
  const rows = [{ hashtags: ['#a', '#b', '#c'] }];
  const line = JSON.parse(serialize(rows, 'ndjson').trim());
  assert.equal(line.hashtags, '#a|#b|#c');
});

// ── serialize — CSV ───────────────────────────────────────────────────────────

test('serialize csv: first line is header', () => {
  const rows = [{ platform: 'instagram', likes_count: 100 }];
  const lines = serialize(rows, 'csv').split('\r\n').filter(Boolean);
  assert.equal(lines[0], 'platform,likes_count');
});

test('serialize csv: data rows follow header', () => {
  const rows = [
    { platform: 'instagram', likes_count: 100 },
    { platform: 'tiktok',    likes_count: 200 },
  ];
  const lines = serialize(rows, 'csv').split('\r\n').filter(Boolean);
  assert.equal(lines.length, 3); // header + 2 rows
  assert.equal(lines[1], 'instagram,100');
  assert.equal(lines[2], 'tiktok,200');
});

test('serialize csv: null values become empty string', () => {
  const rows = [{ platform: 'instagram', bio: null }];
  const lines = serialize(rows, 'csv').split('\r\n').filter(Boolean);
  assert.equal(lines[1], 'instagram,');
});

test('serialize csv: values with comma are double-quoted', () => {
  const rows = [{ content: 'hello, world' }];
  const lines = serialize(rows, 'csv').split('\r\n').filter(Boolean);
  assert.equal(lines[1], '"hello, world"');
});

test('serialize csv: values with double-quote are escaped', () => {
  const rows = [{ content: 'say "hello"' }];
  const lines = serialize(rows, 'csv').split('\r\n').filter(Boolean);
  assert.equal(lines[1], '"say ""hello"""');
});

test('serialize csv: array fields are flattened with pipe separator', () => {
  const rows = [{ hashtags: ['#ai', '#tech'] }];
  const lines = serialize(rows, 'csv').split('\r\n').filter(Boolean);
  assert.equal(lines[1], '#ai|#tech');
});

test('serialize csv: Date objects are serialized to ISO string', () => {
  const d    = new Date('2024-01-15T10:00:00.000Z');
  const rows = [{ scraped_at: d }];
  const lines = serialize(rows, 'csv').split('\r\n').filter(Boolean);
  assert.equal(lines[1], d.toISOString());
});

test('serialize csv: empty array returns empty string', () => {
  assert.equal(serialize([], 'csv'), '');
});

// ── contentType ───────────────────────────────────────────────────────────────

test('contentType: json returns application/json', () => {
  assert.ok(contentType('json').includes('application/json'));
});

test('contentType: csv returns text/csv', () => {
  assert.ok(contentType('csv').includes('text/csv'));
});

test('contentType: ndjson returns application/x-ndjson', () => {
  assert.ok(contentType('ndjson').includes('application/x-ndjson'));
});

// ── filename ──────────────────────────────────────────────────────────────────

test('filename: includes type, platform, and extension', () => {
  const fn = filename('posts', 'instagram', 'csv');
  assert.ok(fn.startsWith('instagram-posts-'));
  assert.ok(fn.endsWith('.csv'));
});

test('filename: ndjson extension is .ndjson not .ndjson', () => {
  const fn = filename('posts', 'tiktok', 'ndjson');
  assert.ok(fn.endsWith('.ndjson'));
});

test('filename: null platform becomes "all"', () => {
  const fn = filename('jobs', null, 'json');
  assert.ok(fn.startsWith('all-jobs-'));
});

// ── unknown format throws ─────────────────────────────────────────────────────

test('serialize: throws for unknown format', () => {
  assert.throws(
    () => serialize([{ x: 1 }], 'xml'),
    /Format tidak dikenal/
  );
});
