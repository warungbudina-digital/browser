import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { ProfileStore } from '../src/browser/ProfileStore.js';

test('ProfileStore seeds default profiles on first load', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ftb-profile-store-'));
  const store = new ProfileStore({
    stateDir: dir,
    defaultProfile: 'openclaw',
    seedProfiles: { openclaw: { driver: 'managed', profileDir: '/tmp/openclaw' } }
  });

  const state = await store.load();
  assert.equal(state.activeProfile, 'openclaw');
  assert.equal(state.profiles.openclaw.driver, 'managed');
});
