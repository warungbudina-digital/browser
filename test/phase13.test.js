import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapshotFromNodes } from '../src/browser/snapshot.js';
import { RefStore } from '../src/browser/RefStore.js';

// ── Role inference (via formatLine output) ────────────────────────────────────

function snapshotText(nodes, interactive = false) {
  return buildSnapshotFromNodes({
    targetId: 'tab-1', url: 'http://x.test', title: 'T',
    nodes, interactive,
  }).text;
}

test('heading role: h1 inferred as heading(1)', () => {
  const t = snapshotText([{ selector: 'h1', tagName: 'H1', role: '', text: 'Welcome', headingLevel: 1 }]);
  assert.ok(t.includes('heading(1)'), `got: ${t}`);
});

test('heading role: h3 inferred as heading(3)', () => {
  const t = snapshotText([{ selector: 'h3', tagName: 'H3', role: '', text: 'Section', headingLevel: 3 }]);
  assert.ok(t.includes('heading(3)'), `got: ${t}`);
});

test('listitem role: li inferred as listitem', () => {
  const t = snapshotText([{ selector: 'li', tagName: 'LI', role: '', text: 'Item' }]);
  assert.ok(t.includes('listitem'), `got: ${t}`);
});

test('nav role: nav tag inferred as navigation', () => {
  const t = snapshotText([{ selector: 'nav', tagName: 'NAV', role: '', text: '' }]);
  assert.ok(t.includes('navigation'), `got: ${t}`);
});

test('slider role: input[type=range] inferred as slider', () => {
  const t = snapshotText([{ selector: 'input', tagName: 'INPUT', role: '', inputType: 'range', text: '' }]);
  assert.ok(t.includes('slider'), `got: ${t}`);
});

test('explicit ARIA role overrides tag inference', () => {
  const t = snapshotText([{ selector: 'div', tagName: 'DIV', role: 'dialog', text: 'Modal' }]);
  assert.ok(t.includes('dialog'), `got: ${t}`);
});

// ── ARIA state annotations ────────────────────────────────────────────────────

test('ariaChecked=true renders [checked]', () => {
  const t = snapshotText([{
    selector: 'input', tagName: 'INPUT', role: '', inputType: 'checkbox',
    text: '', ariaChecked: 'true',
  }]);
  assert.ok(t.includes('[checked]'), `got: ${t}`);
});

test('ariaChecked=false renders [unchecked]', () => {
  const t = snapshotText([{
    selector: 'input', tagName: 'INPUT', role: '', inputType: 'checkbox',
    text: '', ariaChecked: 'false',
  }]);
  assert.ok(t.includes('[unchecked]'), `got: ${t}`);
});

test('ariaExpanded=true renders [expanded]', () => {
  const t = snapshotText([{
    selector: 'button', tagName: 'BUTTON', role: '', text: 'Menu', ariaExpanded: 'true',
  }]);
  assert.ok(t.includes('[expanded]'), `got: ${t}`);
});

test('ariaExpanded=false renders [collapsed]', () => {
  const t = snapshotText([{
    selector: 'button', tagName: 'BUTTON', role: '', text: 'Menu', ariaExpanded: 'false',
  }]);
  assert.ok(t.includes('[collapsed]'), `got: ${t}`);
});

test('ariaDisabled=true renders [disabled]', () => {
  const t = snapshotText([{
    selector: 'button', tagName: 'BUTTON', role: '', text: 'Submit', ariaDisabled: 'true',
  }]);
  assert.ok(t.includes('[disabled]'), `got: ${t}`);
});

test('ariaRequired=true renders [required]', () => {
  const t = snapshotText([{
    selector: 'input', tagName: 'INPUT', role: '', inputType: 'text',
    text: '', ariaRequired: 'true',
  }]);
  assert.ok(t.includes('[required]'), `got: ${t}`);
});

test('ariaCurrent renders [current=page]', () => {
  const t = snapshotText([{
    selector: 'a', tagName: 'A', role: '', text: 'Home', ariaCurrent: 'page',
  }]);
  assert.ok(t.includes('[current=page]'), `got: ${t}`);
});

test('ariaCurrent=false NOT rendered', () => {
  const t = snapshotText([{
    selector: 'a', tagName: 'A', role: '', text: 'Home', ariaCurrent: 'false',
  }]);
  assert.ok(!t.includes('[current='), `should not include current: ${t}`);
});

test('multiple ARIA states rendered together', () => {
  const t = snapshotText([{
    selector: 'input', tagName: 'INPUT', role: '', inputType: 'checkbox',
    text: 'Accept', ariaChecked: 'false', ariaRequired: 'true', ariaDisabled: 'true',
  }]);
  assert.ok(t.includes('[unchecked]'),  `got: ${t}`);
  assert.ok(t.includes('[required]'),   `got: ${t}`);
  assert.ok(t.includes('[disabled]'),   `got: ${t}`);
});

// ── Frame-scoped refs ─────────────────────────────────────────────────────────

test('frame entries produce f{n}e{n} refs in interactive mode', () => {
  const snapshot = buildSnapshotFromNodes({
    targetId: 'tab-1', url: 'http://x.test', title: 'T',
    nodes: [{ selector: 'button', tagName: 'BUTTON', role: '', text: 'Main' }],
    interactive: true,
    frameEntries: [
      {
        frameIndex: 1,
        frameUrl: 'http://x.test/frame.html',
        nodes: [
          { selector: 'input', tagName: 'INPUT', role: '', inputType: 'text', text: '' },
          { selector: 'button', tagName: 'BUTTON', role: '', text: 'Submit' },
        ],
      },
    ],
  });

  // Main ref
  assert.equal(snapshot.refs[0].ref, 'e1');
  assert.equal(snapshot.refs[0].frameIndex, 0);

  // Frame refs
  const frameRefs = snapshot.refs.filter((r) => r.frameIndex === 1);
  assert.equal(frameRefs.length, 2);
  assert.equal(frameRefs[0].ref, 'f1e1');
  assert.equal(frameRefs[1].ref, 'f1e2');

  // Text includes frame separator
  assert.ok(snapshot.text.includes('--- frame 1:'), `text: ${snapshot.text}`);
});

test('frame entries produce f{n}{n} refs in non-interactive mode', () => {
  const snapshot = buildSnapshotFromNodes({
    targetId: 'tab-1', url: 'http://x.test', title: 'T',
    nodes: [],
    interactive: false,
    frameEntries: [
      {
        frameIndex: 2,
        frameUrl: 'http://x.test/embed.html',
        nodes: [{ selector: 'a', tagName: 'A', role: '', text: 'Click' }],
      },
    ],
  });

  const frameRef = snapshot.refs[0];
  assert.equal(frameRef.ref, 'f21');  // frame 2, element 1
  assert.equal(frameRef.frameIndex, 2);
});

test('multiple frames generate independent ref sequences', () => {
  const snapshot = buildSnapshotFromNodes({
    targetId: 'tab-1', url: 'http://x.test', title: 'T',
    nodes: [],
    interactive: true,
    frameEntries: [
      {
        frameIndex: 1,
        frameUrl: 'http://frame1.test',
        nodes: [
          { selector: 'a', tagName: 'A', role: '', text: 'A1' },
          { selector: 'a', tagName: 'A', role: '', text: 'A2' },
        ],
      },
      {
        frameIndex: 2,
        frameUrl: 'http://frame2.test',
        nodes: [
          { selector: 'button', tagName: 'BUTTON', role: '', text: 'B1' },
        ],
      },
    ],
  });

  const frame1Refs = snapshot.refs.filter((r) => r.frameIndex === 1).map((r) => r.ref);
  const frame2Refs = snapshot.refs.filter((r) => r.frameIndex === 2).map((r) => r.ref);

  assert.deepEqual(frame1Refs, ['f1e1', 'f1e2']);
  assert.deepEqual(frame2Refs, ['f2e1']);
});

test('stats.frameCount reflects number of frame entries', () => {
  const snapshot = buildSnapshotFromNodes({
    targetId: 'tab-1', url: 'http://x.test', title: 'T',
    nodes: [],
    interactive: true,
    frameEntries: [
      { frameIndex: 1, frameUrl: 'http://f1.test', nodes: [] },
      { frameIndex: 2, frameUrl: 'http://f2.test', nodes: [] },
    ],
  });
  assert.equal(snapshot.stats.frameCount, 2);
});

test('no frameEntries → stats.frameCount = 0', () => {
  const snapshot = buildSnapshotFromNodes({
    targetId: 'tab-1', url: 'http://x.test', title: 'T',
    nodes: [{ selector: 'button', tagName: 'BUTTON', role: '', text: 'X' }],
    interactive: true,
  });
  assert.equal(snapshot.stats.frameCount, 0);
});

// ── RefStore with frameIndex ──────────────────────────────────────────────────

test('RefStore stores and retrieves frameIndex on refs', () => {
  const store = new RefStore();
  store.setSnapshot('tab-1', {
    refs: [
      { ref: 'e1',   recipe: { selector: 'button' }, frameIndex: 0 },
      { ref: 'f1e1', recipe: { selector: 'input'  }, frameIndex: 1 },
      { ref: 'f2e1', recipe: { selector: 'a'      }, frameIndex: 2 },
    ],
  });

  assert.equal(store.getRef('tab-1', 'e1').frameIndex,   0);
  assert.equal(store.getRef('tab-1', 'f1e1').frameIndex, 1);
  assert.equal(store.getRef('tab-1', 'f2e1').frameIndex, 2);
});

test('RefStore: existing refs without frameIndex still work', () => {
  const store = new RefStore();
  store.setSnapshot('tab-1', {
    refs: [{ ref: '1', recipe: { selector: '#btn' } }],
  });
  const ref = store.getRef('tab-1', '1');
  assert.equal(ref.ref, '1');
  assert.equal(ref.frameIndex, undefined);
});

// ── Backward compatibility ────────────────────────────────────────────────────

test('snapshot without frameEntries still produces correct e-refs', () => {
  const snapshot = buildSnapshotFromNodes({
    targetId: 'tab-1', url: 'http://x.test', title: 'T',
    nodes: [
      { selector: 'button', tagName: 'BUTTON', role: '', text: 'Login' },
      { selector: 'button', tagName: 'BUTTON', role: '', text: 'Login' },
    ],
    interactive: true,
  });
  assert.equal(snapshot.refs[0].ref, 'e1');
  assert.equal(snapshot.refs[1].ref, 'e2');
  assert.equal(snapshot.refs[1].recipe.nth, 1);
  assert.match(snapshot.text, /\[ref=e1\]/);
});
