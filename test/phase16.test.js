import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ScriptStore } from '../src/browser/ScriptStore.js';
import { runScript } from '../src/browser/ScriptRunner.js';

// ── ScriptStore.save ──────────────────────────────────────────────────────────

test('save: returns entry with name, steps, description, timestamps', () => {
  const store = new ScriptStore();
  const entry = store.save('login', { steps: [{ kind: 'click', ref: 'e1' }], description: 'Login flow' });
  assert.equal(entry.name, 'login');
  assert.equal(entry.stepCount, 1);
  assert.equal(entry.description, 'Login flow');
  assert.ok(entry.createdAt, 'should have createdAt');
  assert.ok(entry.updatedAt, 'should have updatedAt');
});

test('save: overwrites existing script, preserves createdAt', () => {
  const store = new ScriptStore();
  const first  = store.save('s', { steps: [{ kind: 'click', ref: 'e1' }] });
  const second = store.save('s', { steps: [{ kind: 'type', ref: 'e2', text: 'hi' }, { kind: 'press', key: 'Enter' }] });
  assert.equal(second.createdAt, first.createdAt);
  assert.equal(second.stepCount, 2);
});

test('save: blank name throws', () => {
  const store = new ScriptStore();
  assert.throws(() => store.save('', { steps: [{ kind: 'click' }] }), /required/i);
  assert.throws(() => store.save('   ', { steps: [{ kind: 'click' }] }), /required/i);
});

test('save: null name throws', () => {
  const store = new ScriptStore();
  assert.throws(() => store.save(null, { steps: [{ kind: 'click' }] }), /required/i);
});

test('save: empty steps array throws', () => {
  const store = new ScriptStore();
  assert.throws(() => store.save('s', { steps: [] }), /empty/i);
});

test('save: non-array steps throws', () => {
  const store = new ScriptStore();
  assert.throws(() => store.save('s', { steps: null }), /empty/i);
});

// ── ScriptStore.get ───────────────────────────────────────────────────────────

test('get: returns saved entry', () => {
  const store = new ScriptStore();
  store.save('x', { steps: [{ kind: 'click' }] });
  const e = store.get('x');
  assert.equal(e.name, 'x');
});

test('get: returns null for unknown name', () => {
  assert.equal(new ScriptStore().get('nope'), null);
});

// ── ScriptStore.list ──────────────────────────────────────────────────────────

test('list: empty store → empty array', () => {
  assert.deepEqual(new ScriptStore().list(), []);
});

test('list: returns all saved scripts', () => {
  const store = new ScriptStore();
  store.save('a', { steps: [{ kind: 'click' }] });
  store.save('b', { steps: [{ kind: 'hover' }] });
  const names = store.list().map((e) => e.name).sort();
  assert.deepEqual(names, ['a', 'b']);
});

// ── ScriptStore.delete ────────────────────────────────────────────────────────

test('delete: removes script, exists returns false', () => {
  const store = new ScriptStore();
  store.save('del', { steps: [{ kind: 'click' }] });
  assert.equal(store.exists('del'), true);
  store.delete('del');
  assert.equal(store.exists('del'), false);
});

test('delete: nonexistent throws', () => {
  assert.throws(() => new ScriptStore().delete('nope'), /not found/i);
});

// ── ScriptStore.exists + size ─────────────────────────────────────────────────

test('exists: false when empty, true after save', () => {
  const store = new ScriptStore();
  assert.equal(store.exists('a'), false);
  store.save('a', { steps: [{ kind: 'click' }] });
  assert.equal(store.exists('a'), true);
});

test('size: reflects number of stored scripts', () => {
  const store = new ScriptStore();
  assert.equal(store.size(), 0);
  store.save('a', { steps: [{ kind: 'click' }] });
  store.save('b', { steps: [{ kind: 'click' }] });
  assert.equal(store.size(), 2);
  store.delete('a');
  assert.equal(store.size(), 1);
});

// ── runScript ─────────────────────────────────────────────────────────────────

test('runScript: empty steps → ok with zero stats', async () => {
  const r = await runScript(() => {}, { steps: [] });
  assert.equal(r.ok, true);
  assert.equal(r.stats.total, 0);
  assert.equal(r.stats.executed, 0);
});

test('runScript: all steps pass → ok=true', async () => {
  const actFn = async (step) => ({ ok: true, kind: step.kind });
  const steps = [{ kind: 'click' }, { kind: 'type', text: 'x' }, { kind: 'press', key: 'Enter' }];
  const r = await runScript(actFn, { steps });
  assert.equal(r.ok, true);
  assert.equal(r.stats.executed, 3);
  assert.equal(r.stats.passed,   3);
  assert.equal(r.stats.failed,   0);
  assert.equal(r.stats.stopped,  false);
});

test('runScript: step throws + stopOnError=true → stops after first failure', async () => {
  let calls = 0;
  const actFn = async (step) => {
    calls++;
    if (step.kind === 'fail') throw new Error('step failed');
    return { ok: true };
  };
  const steps = [{ kind: 'click' }, { kind: 'fail' }, { kind: 'hover' }];
  const r = await runScript(actFn, { steps, stopOnError: true });
  assert.equal(r.ok, false);
  assert.equal(calls, 2);               // stopped after index 1
  assert.equal(r.stats.executed, 2);
  assert.equal(r.stats.failed,   1);
  assert.equal(r.stats.stopped,  true); // not all steps ran
});

test('runScript: step throws + stopOnError=false → continues', async () => {
  const actFn = async (step) => {
    if (step.kind === 'fail') throw new Error('step failed');
    return { ok: true };
  };
  const steps = [{ kind: 'click' }, { kind: 'fail' }, { kind: 'hover' }];
  const r = await runScript(actFn, { steps, stopOnError: false });
  assert.equal(r.ok, false);
  assert.equal(r.stats.executed, 3);
  assert.equal(r.stats.passed,   2);
  assert.equal(r.stats.failed,   1);
  assert.equal(r.stats.stopped,  false);
});

test('runScript: step returns ok=false + stopOnError=true → stops', async () => {
  let calls = 0;
  const actFn = async () => { calls++; return { ok: false }; };
  const r = await runScript(actFn, { steps: [{ kind: 'a' }, { kind: 'b' }], stopOnError: true });
  assert.equal(calls, 1);
  assert.equal(r.stats.stopped, true);
});

test('runScript: step returns ok=false + stopOnError=false → continues', async () => {
  let calls = 0;
  const actFn = async () => { calls++; return { ok: false }; };
  const r = await runScript(actFn, { steps: [{ kind: 'a' }, { kind: 'b' }], stopOnError: false });
  assert.equal(calls, 2);
  assert.equal(r.stats.stopped, false);
  assert.equal(r.stats.failed,  2);
});

test('runScript: results include index and kind', async () => {
  const actFn = async (step) => ({ ok: true, kind: step.kind });
  const r = await runScript(actFn, { steps: [{ kind: 'click' }, { kind: 'type', text: 'x' }] });
  assert.equal(r.results[0].index, 0);
  assert.equal(r.results[0].kind,  'click');
  assert.equal(r.results[1].index, 1);
  assert.equal(r.results[1].kind,  'type');
});

test('runScript: error result includes error message', async () => {
  const actFn = async () => { throw new Error('timeout'); };
  const r = await runScript(actFn, { steps: [{ kind: 'click' }], stopOnError: false });
  assert.equal(r.results[0].error, 'timeout');
  assert.equal(r.results[0].ok, false);
});

test('runScript: stopOnError defaults to true', async () => {
  let calls = 0;
  const actFn = async () => { calls++; throw new Error('x'); };
  const r = await runScript(actFn, { steps: [{ kind: 'a' }, { kind: 'b' }] });
  assert.equal(calls, 1); // stopped after first
  assert.equal(r.stats.stopped, true);
});
