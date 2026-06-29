import test from 'node:test';
import assert from 'node:assert/strict';
import { RefStore } from '../src/browser/RefStore.js';

test('RefStore returns refs from latest snapshot', () => {
  const store = new RefStore();
  store.setSnapshot('tab-1', {
    refs: [
      { ref: '1', recipe: { selector: '#a' } },
      { ref: 'e2', recipe: { selector: '#b' } }
    ]
  });

  assert.deepEqual(store.getRef('tab-1', '1'), { ref: '1', recipe: { selector: '#a' } });
  assert.equal(store.getRef('tab-1', 'missing'), null);
});
