import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WorkspaceContext } from '../src/security/WorkspaceContext.js';

// ── Constructor & properties ──────────────────────────────────────────────────

test('WorkspaceContext: default when no name given', () => {
  assert.equal(new WorkspaceContext().name, 'default');
  assert.equal(new WorkspaceContext(null).name, 'default');
  assert.equal(new WorkspaceContext('').name, 'default');
});

test('WorkspaceContext: isDefault true for "default"', () => {
  assert.equal(new WorkspaceContext('default').isDefault, true);
  assert.equal(new WorkspaceContext(null).isDefault, true);
});

test('WorkspaceContext: isDefault false for named workspace', () => {
  assert.equal(new WorkspaceContext('admin').isDefault, false);
  assert.equal(new WorkspaceContext('bot').isDefault, false);
});

// ── qualify ───────────────────────────────────────────────────────────────────

test('qualify: default workspace returns name unchanged', () => {
  const ws = new WorkspaceContext('default');
  assert.equal(ws.qualify('openclaw'), 'openclaw');
  assert.equal(ws.qualify('custom'),   'custom');
});

test('qualify: named workspace prefixes with name:', () => {
  const ws = new WorkspaceContext('admin');
  assert.equal(ws.qualify('openclaw'), 'admin:openclaw');
  assert.equal(ws.qualify('custom'),   'admin:custom');
});

test('qualify: idempotent — already qualified name not re-prefixed', () => {
  const ws = new WorkspaceContext('admin');
  assert.equal(ws.qualify('admin:openclaw'), 'admin:openclaw');
});

test('qualify: returns falsy values as-is', () => {
  const ws = new WorkspaceContext('admin');
  assert.equal(ws.qualify(null), null);
  assert.equal(ws.qualify(undefined), undefined);
  assert.equal(ws.qualify(''), '');
});

// ── unqualify ─────────────────────────────────────────────────────────────────

test('unqualify: default workspace returns name unchanged', () => {
  const ws = new WorkspaceContext('default');
  assert.equal(ws.unqualify('openclaw'), 'openclaw');
});

test('unqualify: strips workspace prefix', () => {
  const ws = new WorkspaceContext('admin');
  assert.equal(ws.unqualify('admin:openclaw'), 'openclaw');
  assert.equal(ws.unqualify('admin:custom'),   'custom');
});

test('unqualify: does not strip different workspace prefix', () => {
  const ws = new WorkspaceContext('admin');
  assert.equal(ws.unqualify('bot:openclaw'), 'bot:openclaw');
});

test('unqualify: returns falsy values as-is', () => {
  const ws = new WorkspaceContext('admin');
  assert.equal(ws.unqualify(null), null);
});

// ── qualify / unqualify roundtrip ─────────────────────────────────────────────

test('qualify + unqualify roundtrip for named workspace', () => {
  const ws = new WorkspaceContext('bot1');
  const names = ['openclaw', 'remote', 'my-profile'];
  for (const n of names) {
    assert.equal(ws.unqualify(ws.qualify(n)), n);
  }
});

// ── owns ──────────────────────────────────────────────────────────────────────

test('owns: default workspace owns unqualified names', () => {
  const ws = new WorkspaceContext('default');
  assert.equal(ws.owns('openclaw'), true);
  assert.equal(ws.owns('remote'),   true);
});

test('owns: default workspace does NOT own prefixed names', () => {
  const ws = new WorkspaceContext('default');
  assert.equal(ws.owns('admin:openclaw'), false);
  assert.equal(ws.owns('bot:openclaw'),   false);
});

test('owns: named workspace owns its own prefixed names', () => {
  const ws = new WorkspaceContext('admin');
  assert.equal(ws.owns('admin:openclaw'), true);
  assert.equal(ws.owns('admin:remote'),   true);
});

test('owns: named workspace does NOT own other workspace names', () => {
  const ws = new WorkspaceContext('admin');
  assert.equal(ws.owns('bot:openclaw'),  false);
  assert.equal(ws.owns('openclaw'),      false); // milik default
});

test('owns: returns false for falsy values', () => {
  const ws = new WorkspaceContext('admin');
  assert.equal(ws.owns(null),      false);
  assert.equal(ws.owns(undefined), false);
  assert.equal(ws.owns(''),        false);
});

// ── filter ────────────────────────────────────────────────────────────────────

test('filter: default workspace keeps only unqualified names', () => {
  const ws     = new WorkspaceContext('default');
  const names  = ['openclaw', 'admin:openclaw', 'bot:custom', 'remote'];
  const result = ws.filter(names);
  assert.deepEqual(result, ['openclaw', 'remote']);
});

test('filter: named workspace keeps only its own prefixed names', () => {
  const ws     = new WorkspaceContext('admin');
  const names  = ['openclaw', 'admin:openclaw', 'bot:custom', 'admin:remote'];
  const result = ws.filter(names);
  assert.deepEqual(result, ['admin:openclaw', 'admin:remote']);
});

test('filter: empty array returns empty array', () => {
  assert.deepEqual(new WorkspaceContext('admin').filter([]), []);
});

// ── cross-workspace isolation ─────────────────────────────────────────────────

test('two workspaces are fully isolated', () => {
  const admin = new WorkspaceContext('admin');
  const bot   = new WorkspaceContext('bot');

  const adminProfile = admin.qualify('openclaw'); // 'admin:openclaw'
  const botProfile   = bot.qualify('openclaw');   // 'bot:openclaw'

  assert.notEqual(adminProfile, botProfile);
  assert.equal(admin.owns(adminProfile), true);
  assert.equal(admin.owns(botProfile),   false);
  assert.equal(bot.owns(botProfile),     true);
  assert.equal(bot.owns(adminProfile),   false);
});
