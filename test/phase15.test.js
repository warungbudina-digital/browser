import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refKey, ariaStatesEqual, diff, diffText } from '../src/browser/SnapshotDiff.js';
import { buildSnapshotFromNodes } from '../src/browser/snapshot.js';
import { RefStore } from '../src/browser/RefStore.js';

// ── refKey ────────────────────────────────────────────────────────────────────

test('refKey: produces role|name|nth|frame string', () => {
  const entry = { recipe: { role: 'button', name: 'Submit', nth: 0 }, frameIndex: 0 };
  assert.equal(refKey(entry), 'button|Submit|0|0');
});

test('refKey: nth defaults to 0 if missing', () => {
  const entry = { recipe: { role: 'link', name: 'Home' }, frameIndex: 0 };
  assert.equal(refKey(entry), 'link|Home|0|0');
});

test('refKey: frameIndex defaults to 0 if missing', () => {
  const entry = { recipe: { role: 'checkbox', name: 'Accept', nth: 0 } };
  assert.equal(refKey(entry), 'checkbox|Accept|0|0');
});

test('refKey: frame-scoped entry uses frameIndex', () => {
  const entry = { recipe: { role: 'button', name: 'OK', nth: 0 }, frameIndex: 2 };
  assert.equal(refKey(entry), 'button|OK|0|2');
});

test('refKey: empty name preserved', () => {
  const entry = { recipe: { role: 'img', name: '', nth: 0 }, frameIndex: 0 };
  assert.equal(refKey(entry), 'img||0|0');
});

// ── ariaStatesEqual ───────────────────────────────────────────────────────────

test('ariaStatesEqual: both null → equal', () => {
  assert.equal(ariaStatesEqual(null, null), true);
});

test('ariaStatesEqual: both undefined → equal', () => {
  assert.equal(ariaStatesEqual(undefined, undefined), true);
});

test('ariaStatesEqual: identical objects → equal', () => {
  const s = { checked: 'true', expanded: null, disabled: null, required: null, current: null };
  assert.equal(ariaStatesEqual(s, { ...s }), true);
});

test('ariaStatesEqual: checked differs → not equal', () => {
  const a = { checked: 'false', expanded: null, disabled: null, required: null, current: null };
  const b = { checked: 'true',  expanded: null, disabled: null, required: null, current: null };
  assert.equal(ariaStatesEqual(a, b), false);
});

test('ariaStatesEqual: expanded differs → not equal', () => {
  const a = { checked: null, expanded: 'false', disabled: null, required: null, current: null };
  const b = { checked: null, expanded: 'true',  disabled: null, required: null, current: null };
  assert.equal(ariaStatesEqual(a, b), false);
});

test('ariaStatesEqual: one null, one object → not equal', () => {
  const s = { checked: null, expanded: null, disabled: null, required: null, current: null };
  assert.equal(ariaStatesEqual(null, s), false);
});

// ── diff ──────────────────────────────────────────────────────────────────────

function makeRef(role, name, nth = 0, ariaState = null, frameIndex = 0, ref = '1') {
  return {
    ref,
    recipe: { role, name, nth, selector: `${role}`, tagName: role, inputType: null },
    frameIndex,
    ariaState: ariaState ?? { checked: null, expanded: null, disabled: null, required: null, current: null },
  };
}

function makeSnap(refs) {
  return { refs };
}

test('diff: identical snapshots → all unchanged', () => {
  const r = makeRef('button', 'OK');
  const snap = makeSnap([r]);
  const result = diff(snap, snap);
  assert.equal(result.stats.unchanged, 1);
  assert.equal(result.stats.added, 0);
  assert.equal(result.stats.removed, 0);
  assert.equal(result.stats.changed, 0);
  assert.equal(result.summary, 'no changes');
});

test('diff: empty snapshots → no changes', () => {
  const result = diff(makeSnap([]), makeSnap([]));
  assert.equal(result.summary, 'no changes');
  assert.equal(result.stats.total, 0);
});

test('diff: null snapshots handled gracefully', () => {
  const result = diff(null, null);
  assert.equal(result.stats.total, 0);
  assert.equal(result.summary, 'no changes');
});

test('diff: element added in B → appears in added', () => {
  const snapA = makeSnap([makeRef('button', 'Login', 0, null, 0, 'e1')]);
  const snapB = makeSnap([
    makeRef('button', 'Login',  0, null, 0, 'e1'),
    makeRef('button', 'Signup', 0, null, 0, 'e2'),
  ]);
  const result = diff(snapA, snapB);
  assert.equal(result.stats.added, 1);
  assert.equal(result.stats.unchanged, 1);
  assert.equal(result.added[0].recipe.name, 'Signup');
  assert.ok(result.summary.includes('+1 added'));
});

test('diff: element removed from B → appears in removed', () => {
  const snapA = makeSnap([
    makeRef('button', 'Login',  0, null, 0, 'e1'),
    makeRef('button', 'Signup', 0, null, 0, 'e2'),
  ]);
  const snapB = makeSnap([makeRef('button', 'Login', 0, null, 0, 'e1')]);
  const result = diff(snapA, snapB);
  assert.equal(result.stats.removed, 1);
  assert.equal(result.removed[0].recipe.name, 'Signup');
  assert.ok(result.summary.includes('-1 removed'));
});

test('diff: ariaState changed → appears in changed', () => {
  const snapA = makeSnap([
    makeRef('checkbox', 'Accept', 0,
      { checked: 'false', expanded: null, disabled: null, required: null, current: null }, 0, 'e1'),
  ]);
  const snapB = makeSnap([
    makeRef('checkbox', 'Accept', 0,
      { checked: 'true',  expanded: null, disabled: null, required: null, current: null }, 0, 'e1'),
  ]);
  const result = diff(snapA, snapB);
  assert.equal(result.stats.changed, 1);
  assert.equal(result.changed[0].changedFields[0], 'ariaState');
  assert.ok(result.summary.includes('~1 changed'));
});

test('diff: expanded state change detected', () => {
  const stateA = { checked: null, expanded: 'false', disabled: null, required: null, current: null };
  const stateB = { checked: null, expanded: 'true',  disabled: null, required: null, current: null };
  const result = diff(
    makeSnap([makeRef('button', 'Menu', 0, stateA, 0, 'e1')]),
    makeSnap([makeRef('button', 'Menu', 0, stateB, 0, 'e1')]),
  );
  assert.equal(result.stats.changed, 1);
  assert.equal(result.changed[0].before.ariaState.expanded, 'false');
  assert.equal(result.changed[0].after.ariaState.expanded,  'true');
});

test('diff: mixed — add, remove, change, unchanged', () => {
  const snapA = makeSnap([
    makeRef('button', 'A', 0, null, 0, 'e1'),
    makeRef('button', 'B', 0, { checked: 'false', expanded: null, disabled: null, required: null, current: null }, 0, 'e2'),
    makeRef('button', 'C', 0, null, 0, 'e3'),
  ]);
  const snapB = makeSnap([
    makeRef('button', 'A', 0, null, 0, 'e1'),                // unchanged
    makeRef('button', 'B', 0, { checked: 'true', expanded: null, disabled: null, required: null, current: null }, 0, 'e2'),  // changed
    makeRef('button', 'D', 0, null, 0, 'e3'),                // added (C removed, D added)
  ]);
  const result = diff(snapA, snapB);
  assert.equal(result.stats.unchanged, 1); // A
  assert.equal(result.stats.changed,   1); // B
  assert.equal(result.stats.added,     1); // D
  assert.equal(result.stats.removed,   1); // C
  assert.equal(result.summary, '+1 added, -1 removed, ~1 changed');
});

test('diff: nth distinguishes duplicate role+name elements', () => {
  const snapA = makeSnap([
    makeRef('button', 'OK', 0, null, 0, 'e1'),
    makeRef('button', 'OK', 1, null, 0, 'e2'),
  ]);
  const snapB = makeSnap([
    makeRef('button', 'OK', 0, null, 0, 'e1'), // same
    // e2 (nth=1) removed
  ]);
  const result = diff(snapA, snapB);
  assert.equal(result.stats.removed, 1);
  assert.equal(result.removed[0].recipe.nth, 1);
});

// ── diffText ──────────────────────────────────────────────────────────────────

test('diffText: no changes → single summary line', () => {
  const result = diff(makeSnap([]), makeSnap([]));
  assert.equal(diffText(result), 'diff: no changes');
});

test('diffText: added element shows + prefix', () => {
  const result = diff(
    makeSnap([]),
    makeSnap([makeRef('link', 'About', 0, null, 0, 'e1')]),
  );
  const text = diffText(result);
  assert.ok(text.includes('+ [e1] link "About"'), `got: ${text}`);
});

test('diffText: removed element shows - prefix', () => {
  const result = diff(
    makeSnap([makeRef('button', 'Close', 0, null, 0, 'e1')]),
    makeSnap([]),
  );
  const text = diffText(result);
  assert.ok(text.includes('- [e1] button "Close"'), `got: ${text}`);
});

test('diffText: changed element shows ~ prefix with state transition', () => {
  const stateA = { checked: 'false', expanded: null, disabled: null, required: null, current: null };
  const stateB = { checked: 'true',  expanded: null, disabled: null, required: null, current: null };
  const result = diff(
    makeSnap([makeRef('checkbox', 'TOS', 0, stateA, 0, 'e1')]),
    makeSnap([makeRef('checkbox', 'TOS', 0, stateB, 0, 'e1')]),
  );
  const text = diffText(result);
  assert.ok(text.includes('~ [e1→e1]'), `got: ${text}`);
  assert.ok(text.includes('ariaState'),  `got: ${text}`);
});

// ── buildSnapshotFromNodes — ariaState in refs ────────────────────────────────

test('buildSnapshotFromNodes: refs include ariaState field', () => {
  const snap = buildSnapshotFromNodes({
    targetId: 'tab-1', url: 'http://x.test', title: 'T',
    nodes: [{ selector: 'input', tagName: 'INPUT', role: '', inputType: 'checkbox', text: '', ariaChecked: 'true' }],
    interactive: true,
  });
  assert.ok('ariaState' in snap.refs[0], 'ariaState should be in ref entry');
  assert.equal(snap.refs[0].ariaState.checked, 'true');
});

test('buildSnapshotFromNodes: ariaState null fields when no ARIA attrs', () => {
  const snap = buildSnapshotFromNodes({
    targetId: 'tab-1', url: 'http://x.test', title: 'T',
    nodes: [{ selector: 'button', tagName: 'BUTTON', role: '', text: 'Go' }],
    interactive: true,
  });
  const state = snap.refs[0].ariaState;
  assert.equal(state.checked,  null);
  assert.equal(state.expanded, null);
  assert.equal(state.disabled, null);
});

// ── RefStore — getPrevSnapshot ────────────────────────────────────────────────

test('RefStore: getPrevSnapshot returns null before first setSnapshot', () => {
  const store = new RefStore();
  assert.equal(store.getPrevSnapshot('tab-1'), null);
});

test('RefStore: getPrevSnapshot returns null after first setSnapshot', () => {
  const store = new RefStore();
  store.setSnapshot('tab-1', { refs: [] });
  assert.equal(store.getPrevSnapshot('tab-1'), null);
});

test('RefStore: getPrevSnapshot returns old snapshot after second setSnapshot', () => {
  const store = new RefStore();
  const snap1 = { refs: [{ ref: 'e1' }] };
  const snap2 = { refs: [{ ref: 'e2' }] };
  store.setSnapshot('tab-1', snap1);
  store.setSnapshot('tab-1', snap2);
  const prev = store.getPrevSnapshot('tab-1');
  assert.equal(prev.refs[0].ref, 'e1');
  assert.equal(store.getSnapshot('tab-1').refs[0].ref, 'e2');
});
