import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ResourceBlocker, VALID_RESOURCE_TYPES } from '../src/browser/ResourceBlocker.js';

// ── VALID_RESOURCE_TYPES ──────────────────────────────────────────────────────

test('VALID_RESOURCE_TYPES: is a Set', () => {
  assert.ok(VALID_RESOURCE_TYPES instanceof Set);
});

test('VALID_RESOURCE_TYPES: contains common resource types', () => {
  for (const t of ['image', 'script', 'stylesheet', 'xhr', 'fetch', 'font', 'media']) {
    assert.ok(VALID_RESOURCE_TYPES.has(t), `missing: ${t}`);
  }
});

test('VALID_RESOURCE_TYPES: has at least 10 entries', () => {
  assert.ok(VALID_RESOURCE_TYPES.size >= 10);
});

// ── block ─────────────────────────────────────────────────────────────────────

test('block: blocks a single type (string)', () => {
  const blocker = new ResourceBlocker();
  const result  = blocker.block('image');
  assert.ok(result.includes('image'));
});

test('block: blocks multiple types (array)', () => {
  const blocker = new ResourceBlocker();
  const result  = blocker.block(['image', 'font']);
  assert.ok(result.includes('image'));
  assert.ok(result.includes('font'));
});

test('block: returns full blocked list', () => {
  const blocker = new ResourceBlocker();
  blocker.block('image');
  const result = blocker.block('script');
  assert.ok(result.includes('image'));
  assert.ok(result.includes('script'));
});

test('block: multiple block() calls are additive', () => {
  const blocker = new ResourceBlocker();
  blocker.block('image');
  blocker.block('script');
  assert.equal(blocker.blockedTypes().length, 2);
});

test('block: blocking same type twice — no duplicates', () => {
  const blocker = new ResourceBlocker();
  blocker.block('image');
  blocker.block('image');
  assert.equal(blocker.blockedTypes().filter((t) => t === 'image').length, 1);
});

test('block: throws for invalid type', () => {
  assert.throws(() => new ResourceBlocker().block('rainbow'), /Invalid resource type/);
});

test('block: throws for invalid type in array', () => {
  assert.throws(() => new ResourceBlocker().block(['image', 'magic']), /Invalid resource type/);
});

// ── unblock ───────────────────────────────────────────────────────────────────

test('unblock: removes a blocked type', () => {
  const blocker = new ResourceBlocker();
  blocker.block(['image', 'font']);
  const remaining = blocker.unblock('image');
  assert.ok(!remaining.includes('image'));
  assert.ok(remaining.includes('font'));
});

test('unblock: returns remaining blocked types', () => {
  const blocker = new ResourceBlocker();
  blocker.block(['image', 'font', 'script']);
  const remaining = blocker.unblock(['image', 'font']);
  assert.deepEqual(remaining, ['script']);
});

test('unblock: is no-op for already-unblocked type', () => {
  const blocker = new ResourceBlocker();
  blocker.block('image');
  const remaining = blocker.unblock('script'); // not blocked
  assert.ok(remaining.includes('image'));
});

test('unblock: throws for invalid type', () => {
  assert.throws(() => new ResourceBlocker().unblock('unicorn'), /Invalid resource type/);
});

// ── isBlocked ─────────────────────────────────────────────────────────────────

test('isBlocked: true for blocked type', () => {
  const blocker = new ResourceBlocker();
  blocker.block('image');
  assert.equal(blocker.isBlocked('image'), true);
});

test('isBlocked: false for non-blocked type', () => {
  const blocker = new ResourceBlocker();
  assert.equal(blocker.isBlocked('image'), false);
});

test('isBlocked: false after unblock', () => {
  const blocker = new ResourceBlocker();
  blocker.block('image');
  blocker.unblock('image');
  assert.equal(blocker.isBlocked('image'), false);
});

// ── blockedTypes ──────────────────────────────────────────────────────────────

test('blockedTypes: returns empty array initially', () => {
  assert.deepEqual(new ResourceBlocker().blockedTypes(), []);
});

test('blockedTypes: returns all currently blocked types', () => {
  const blocker = new ResourceBlocker();
  blocker.block(['image', 'font']);
  const blocked = blocker.blockedTypes();
  assert.ok(blocked.includes('image'));
  assert.ok(blocked.includes('font'));
  assert.equal(blocked.length, 2);
});

// ── clear ─────────────────────────────────────────────────────────────────────

test('clear: unblocks all types', () => {
  const blocker = new ResourceBlocker();
  blocker.block(['image', 'font', 'script']);
  blocker.clear();
  assert.deepEqual(blocker.blockedTypes(), []);
});

test('clear: isBlocked returns false after clear', () => {
  const blocker = new ResourceBlocker();
  blocker.block('image');
  blocker.clear();
  assert.equal(blocker.isBlocked('image'), false);
});

// ── source checks ─────────────────────────────────────────────────────────────

test('BrowserService source imports ResourceBlocker', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('ResourceBlocker'), 'ResourceBlocker import missing');
});

test('BrowserService source includes resourceBlocker instance', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('resourceBlocker'), 'resourceBlocker instance missing');
});

test('BrowserService source includes resourceBlock method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('resourceBlock'), 'resourceBlock method missing');
});

test('BrowserService source checks resourceType in route handler', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('resourceType'), 'resourceType check missing from route handler');
});

test('BrowserManager source includes resource-block dispatch', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes("case 'resource-block'"), 'resource-block dispatch missing');
});

test('BrowserManager source includes resourceActions in capabilities', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes('resourceActions'), 'resourceActions missing from capabilities');
});
