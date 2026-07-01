import test from 'node:test';
import assert from 'node:assert/strict';
import { TikTokUploader } from '../src/scraper/platforms/tiktokUpload.js';

function fakeDispatch(overrides = {}) {
  const calls = [];
  const dispatch = async (action, payload = {}) => {
    calls.push({ action, payload });
    if (overrides[action]) return overrides[action](payload, calls);
    return { ok: true };
  };
  dispatch.calls = calls;
  return dispatch;
}

test('publish drives navigate -> upload -> caption -> post in order (no schedule)', async () => {
  const dispatch = fakeDispatch({
    act: (payload) => {
      if (payload.request.kind === 'evaluate') return { result: 'https://www.tiktok.com/@demo' };
      return { ok: true };
    },
  });

  const uploader = new TikTokUploader();
  const result = await uploader.publish(dispatch, {
    videoPath: '/data/artifacts/video.mp4',
    description: 'Hello #fyp',
  });

  assert.equal(result.ok, true);
  assert.equal(result.postUrl, 'https://www.tiktok.com/@demo');

  const actions = dispatch.calls.map((c) => c.action);
  assert.deepEqual(actions, ['navigate', 'act', 'upload', 'act', 'act', 'act', 'act', 'act']);

  const uploadCall = dispatch.calls.find((c) => c.action === 'upload');
  assert.deepEqual(uploadCall.payload.paths, ['/data/artifacts/video.mp4']);

  const kinds = dispatch.calls.filter((c) => c.action === 'act').map((c) => c.payload.request.kind);
  assert.deepEqual(kinds, ['wait', 'wait', 'type', 'click', 'wait', 'evaluate']);
});

test('publish skips caption step when description is empty', async () => {
  const dispatch = fakeDispatch({
    act: (payload) => (payload.request.kind === 'evaluate' ? { result: null } : { ok: true }),
  });

  const uploader = new TikTokUploader();
  await uploader.publish(dispatch, { videoPath: '/data/artifacts/video.mp4' });

  const kinds = dispatch.calls.filter((c) => c.action === 'act').map((c) => c.payload.request.kind);
  assert.ok(!kinds.includes('type'));
});

test('publish applies schedule fields when schedule is provided', async () => {
  const dispatch = fakeDispatch({
    act: (payload) => (payload.request.kind === 'evaluate' ? { result: null } : { ok: true }),
  });

  const schedule = new Date(Date.now() + 60 * 60_000).toISOString(); // 1 jam dari sekarang
  const uploader = new TikTokUploader();
  await uploader.publish(dispatch, { videoPath: '/data/artifacts/video.mp4', schedule });

  const fillCall = dispatch.calls.find((c) => c.action === 'act' && c.payload.request.kind === 'fill');
  assert.ok(fillCall, 'expected a fill act for schedule date/time');
  assert.equal(fillCall.payload.request.fields.length, 2);
});

test('publish rejects a schedule less than 20 minutes out without touching the browser', async () => {
  const dispatch = fakeDispatch();
  const schedule = new Date(Date.now() + 5 * 60_000).toISOString();
  const uploader = new TikTokUploader();

  await assert.rejects(
    () => uploader.publish(dispatch, { videoPath: '/data/artifacts/video.mp4', schedule }),
    /minimal 20 menit/
  );
  assert.equal(dispatch.calls.length, 0);
});

test('publish rejects a schedule more than 10 days out without touching the browser', async () => {
  const dispatch = fakeDispatch();
  const schedule = new Date(Date.now() + 11 * 24 * 60 * 60_000).toISOString();
  const uploader = new TikTokUploader();

  await assert.rejects(
    () => uploader.publish(dispatch, { videoPath: '/data/artifacts/video.mp4', schedule }),
    /dalam 10 hari/
  );
  assert.equal(dispatch.calls.length, 0);
});

test('publish requires videoPath', async () => {
  const dispatch = fakeDispatch();
  const uploader = new TikTokUploader();
  await assert.rejects(() => uploader.publish(dispatch, {}), /videoPath wajib diisi/);
  assert.equal(dispatch.calls.length, 0);
});
