import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PermissionManager, VALID_PERMISSIONS } from '../src/browser/PermissionManager.js';

// ── VALID_PERMISSIONS ─────────────────────────────────────────────────────────

test('VALID_PERMISSIONS: is a Set', () => {
  assert.ok(VALID_PERMISSIONS instanceof Set);
});

test('VALID_PERMISSIONS: contains core browser permissions', () => {
  for (const p of ['geolocation', 'notifications', 'camera', 'microphone', 'clipboard-read', 'clipboard-write']) {
    assert.ok(VALID_PERMISSIONS.has(p), `missing permission: ${p}`);
  }
});

test('VALID_PERMISSIONS: has at least 10 entries', () => {
  assert.ok(VALID_PERMISSIONS.size >= 10);
});

// ── grant ─────────────────────────────────────────────────────────────────────

test('grant: stores permission for targetId', () => {
  const mgr     = new PermissionManager();
  const granted = mgr.grant('t1', 'geolocation');
  assert.ok(granted.includes('geolocation'));
});

test('grant: returns full list of granted permissions', () => {
  const mgr = new PermissionManager();
  mgr.grant('t1', 'geolocation');
  const result = mgr.grant('t1', 'notifications');
  assert.ok(result.includes('geolocation'));
  assert.ok(result.includes('notifications'));
});

test('grant: accepts array of permissions', () => {
  const mgr = new PermissionManager();
  const res = mgr.grant('t1', ['camera', 'microphone']);
  assert.ok(res.includes('camera'));
  assert.ok(res.includes('microphone'));
});

test('grant: merges with existing grants (no duplicates)', () => {
  const mgr = new PermissionManager();
  mgr.grant('t1', 'geolocation');
  mgr.grant('t1', 'geolocation');
  assert.equal(mgr.list('t1').filter((p) => p === 'geolocation').length, 1);
});

test('grant: throws for null targetId', () => {
  assert.throws(() => new PermissionManager().grant(null, 'geolocation'), /targetId/);
});

test('grant: throws for invalid permission', () => {
  assert.throws(() => new PermissionManager().grant('t1', 'super-power'), /Invalid permission/);
});

test('grant: throws for invalid permission in array', () => {
  assert.throws(() => new PermissionManager().grant('t1', ['geolocation', 'magic']), /Invalid permission/);
});

// ── revoke ────────────────────────────────────────────────────────────────────

test('revoke: removes specific permission', () => {
  const mgr = new PermissionManager();
  mgr.grant('t1', ['geolocation', 'notifications']);
  const remaining = mgr.revoke('t1', 'geolocation');
  assert.ok(!remaining.includes('geolocation'));
  assert.ok(remaining.includes('notifications'));
});

test('revoke: returns remaining list', () => {
  const mgr = new PermissionManager();
  mgr.grant('t1', ['camera', 'microphone']);
  const remaining = mgr.revoke('t1', 'camera');
  assert.deepEqual(remaining, ['microphone']);
});

test('revoke: is no-op for permission not granted', () => {
  const mgr = new PermissionManager();
  mgr.grant('t1', 'notifications');
  const remaining = mgr.revoke('t1', 'camera');
  assert.ok(remaining.includes('notifications'));
});

test('revoke: returns empty array for unknown targetId', () => {
  const mgr = new PermissionManager();
  assert.deepEqual(mgr.revoke('unknown', 'geolocation'), []);
});

test('revoke: throws for null targetId', () => {
  assert.throws(() => new PermissionManager().revoke(null, 'geolocation'), /targetId/);
});

test('revoke: throws for invalid permission', () => {
  assert.throws(() => new PermissionManager().revoke('t1', 'fake-perm'), /Invalid permission/);
});

// ── reset ─────────────────────────────────────────────────────────────────────

test('reset: clears grants for a specific targetId', () => {
  const mgr = new PermissionManager();
  mgr.grant('t1', 'geolocation');
  mgr.grant('t2', 'camera');
  mgr.reset('t1');
  assert.deepEqual(mgr.list('t1'), []);
  assert.ok(mgr.list('t2').includes('camera'));
});

test('resetAll: clears all grants', () => {
  const mgr = new PermissionManager();
  mgr.grant('t1', 'geolocation');
  mgr.grant('t2', 'camera');
  mgr.resetAll();
  assert.deepEqual(mgr.listAll(), {});
});

// ── list ──────────────────────────────────────────────────────────────────────

test('list: returns granted permissions for targetId', () => {
  const mgr = new PermissionManager();
  mgr.grant('t1', ['geolocation', 'camera']);
  const perms = mgr.list('t1');
  assert.ok(perms.includes('geolocation'));
  assert.ok(perms.includes('camera'));
});

test('list: returns empty array for unknown targetId', () => {
  assert.deepEqual(new PermissionManager().list('nobody'), []);
});

// ── listAll ───────────────────────────────────────────────────────────────────

test('listAll: returns object with all targetIds', () => {
  const mgr = new PermissionManager();
  mgr.grant('t1', 'geolocation');
  mgr.grant('t2', 'camera');
  const all = mgr.listAll();
  assert.ok(Array.isArray(all['t1']));
  assert.ok(Array.isArray(all['t2']));
  assert.ok(all['t1'].includes('geolocation'));
});

test('listAll: returns empty object when nothing granted', () => {
  assert.deepEqual(new PermissionManager().listAll(), {});
});

test('listAll: multiple targetIds tracked independently', () => {
  const mgr = new PermissionManager();
  mgr.grant('a', 'geolocation');
  mgr.grant('b', 'notifications');
  const all = mgr.listAll();
  assert.ok(!all['a'].includes('notifications'));
  assert.ok(!all['b'].includes('geolocation'));
});

// ── source checks ─────────────────────────────────────────────────────────────

test('BrowserService source imports PermissionManager', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('PermissionManager'), 'PermissionManager import missing');
});

test('BrowserService source includes permissionGrant method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('permissionGrant'), 'permissionGrant method missing');
});

test('BrowserService source includes permissionManager instance', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('permissionManager'), 'permissionManager instance missing');
});

test('BrowserManager source includes permission-grant dispatch', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes("case 'permission-grant'"), 'permission-grant dispatch missing');
});

test('BrowserManager source includes permissionActions in capabilities', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes('permissionActions'), 'permissionActions missing from capabilities');
});
