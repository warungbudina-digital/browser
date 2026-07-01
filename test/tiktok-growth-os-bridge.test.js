import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { TiktokGrowthOsBridge } from '../src/scraper/TiktokGrowthOsBridge.js';

const samplePost = (overrides = {}) => ({
  postUrl: 'https://www.tiktok.com/@demo/video/123',
  postId: '123',
  content: 'Demo caption',
  likesCount: 10,
  commentsCount: 2,
  sharesCount: 1,
  viewsCount: 100,
  ...overrides,
});

async function tmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ftb-tiktok-bridge-'));
}

test('disabled bridge is a no-op', async () => {
  const bridge = new TiktokGrowthOsBridge({ enabled: false, memoryDir: await tmpDir() });
  const result = await bridge.logResults('job-1', { posts: [samplePost()] });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'disabled');
});

test('enabled bridge with no posts is a no-op', async () => {
  const bridge = new TiktokGrowthOsBridge({ enabled: true, memoryDir: await tmpDir() });
  const result = await bridge.logResults('job-1', { posts: [] });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'no_posts');
});

test('logResults writes entries matching the Python make_video_log schema', async () => {
  const dir = await tmpDir();
  const bridge = new TiktokGrowthOsBridge({ enabled: true, memoryDir: dir });

  const result = await bridge.logResults('job-1', { posts: [samplePost(), samplePost({ postId: '456' })] });
  assert.equal(result.ok, true);
  assert.equal(result.added, 2);

  const raw = await fs.readFile(path.join(dir, 'analytics.json'), 'utf8');
  const data = JSON.parse(raw);
  assert.equal(data.videos.length, 2);

  const entry = data.videos[0];
  assert.match(entry.id, /^VID-[0-9A-F]{8}$/);
  assert.equal(entry.topic, '');
  assert.equal(entry.angle, '');
  assert.equal(entry.hook_type, '');
  assert.equal(entry.views, 100);
  assert.equal(entry.likes, 10);
  assert.equal(entry.comments, 2);
  assert.equal(entry.shares, 1);
  assert.equal(entry.completion_rate, 0);
  assert.equal(typeof entry.logged_at, 'string');
  assert.equal(entry.source, 'scraped');
  assert.equal(entry.job_id, 'job-1');
  assert.equal(entry.video_url, 'https://www.tiktok.com/@demo/video/123');
});

test('a second job appends rather than overwrites', async () => {
  const dir = await tmpDir();
  const bridge = new TiktokGrowthOsBridge({ enabled: true, memoryDir: dir });

  await bridge.logResults('job-1', { posts: [samplePost()] });
  await bridge.logResults('job-2', { posts: [samplePost({ postId: '789' })] });

  const raw = await fs.readFile(path.join(dir, 'analytics.json'), 'utf8');
  const data = JSON.parse(raw);
  assert.equal(data.videos.length, 2);
  const jobIds = data.videos.map((v) => v.job_id).sort();
  assert.deepEqual(jobIds, ['job-1', 'job-2']);
});

test('concurrent logResults calls do not lose updates (mutex regression test)', async () => {
  const dir = await tmpDir();
  const bridge = new TiktokGrowthOsBridge({ enabled: true, memoryDir: dir });

  await Promise.all([
    bridge.logResults('job-a', { posts: [samplePost({ postId: 'a1' }), samplePost({ postId: 'a2' })] }),
    bridge.logResults('job-b', { posts: [samplePost({ postId: 'b1' }), samplePost({ postId: 'b2' })] }),
  ]);

  const raw = await fs.readFile(path.join(dir, 'analytics.json'), 'utf8');
  const data = JSON.parse(raw);
  assert.equal(data.videos.length, 4);
  const jobIds = data.videos.map((v) => v.job_id).sort();
  assert.deepEqual(jobIds, ['job-a', 'job-a', 'job-b', 'job-b']);
});
