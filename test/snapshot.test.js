import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapshotFromNodes } from '../src/browser/snapshot.js';

test('buildSnapshotFromNodes emits stable role-style refs', () => {
  const snapshot = buildSnapshotFromNodes({
    targetId: 'tab-1',
    url: 'https://example.com',
    title: 'Example',
    interactive: true,
    nodes: [
      { selector: 'body > button:nth-of-type(1)', tagName: 'BUTTON', role: '', text: 'Login' },
      { selector: 'body > button:nth-of-type(2)', tagName: 'BUTTON', role: '', text: 'Login' }
    ]
  });

  assert.equal(snapshot.refs[0].ref, 'e1');
  assert.equal(snapshot.refs[1].recipe.nth, 1);
  assert.match(snapshot.text, /\[ref=e1\]/);
});
