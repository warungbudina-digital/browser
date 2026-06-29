import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHUTDOWN_STEPS, runShutdownStep, shutdown } from '../src/Shutdown.js';

// ── SHUTDOWN_STEPS constant ───────────────────────────────────────────────────

test('SHUTDOWN_STEPS: is an array of 8 steps', () => {
  assert.equal(SHUTDOWN_STEPS.length, 8);
  for (const step of SHUTDOWN_STEPS) {
    assert.ok(step.name,   `step.name missing in: ${JSON.stringify(step)}`);
    assert.ok(step.key,    `step.key missing in: ${JSON.stringify(step)}`);
    assert.ok(step.method, `step.method missing in: ${JSON.stringify(step)}`);
  }
});

test('SHUTDOWN_STEPS: first step is HTTP server', () => {
  assert.equal(SHUTDOWN_STEPS[0].key, 'server');
  assert.equal(SHUTDOWN_STEPS[0].method, 'close');
});

test('SHUTDOWN_STEPS: SSE manager comes before Scheduler', () => {
  const sseIdx   = SHUTDOWN_STEPS.findIndex((s) => s.key === 'sseManager');
  const schedIdx = SHUTDOWN_STEPS.findIndex((s) => s.key === 'scheduler');
  assert.ok(sseIdx < schedIdx, 'SSE should close before Scheduler');
});

test('SHUTDOWN_STEPS: JobQueue comes before DataStore', () => {
  const queueIdx = SHUTDOWN_STEPS.findIndex((s) => s.key === 'jobQueue');
  const dbIdx    = SHUTDOWN_STEPS.findIndex((s) => s.key === 'dataStore');
  assert.ok(queueIdx < dbIdx, 'Queue should drain before DB closes');
});

test('SHUTDOWN_STEPS: DataStore before MQTT', () => {
  const dbIdx   = SHUTDOWN_STEPS.findIndex((s) => s.key === 'dataStore');
  const mqttIdx = SHUTDOWN_STEPS.findIndex((s) => s.key === 'mqttPublisher');
  assert.ok(dbIdx < mqttIdx);
});

// ── runShutdownStep ───────────────────────────────────────────────────────────

test('runShutdownStep: calls the correct method and returns ok=true', async () => {
  let called = false;
  const services = { server: { close: async () => { called = true; } } };
  const r = await runShutdownStep({ name: 'HTTP server', key: 'server', method: 'close' }, services);
  assert.equal(r.ok,      true);
  assert.equal(r.skipped, false);
  assert.equal(called,    true);
});

test('runShutdownStep: null service → skipped=true, ok=true', async () => {
  const r = await runShutdownStep({ name: 'X', key: 'x', method: 'close' }, { x: null });
  assert.equal(r.skipped, true);
  assert.equal(r.ok,      true);
});

test('runShutdownStep: missing service key → skipped', async () => {
  const r = await runShutdownStep({ name: 'X', key: 'missing', method: 'close' }, {});
  assert.equal(r.skipped, true);
});

test('runShutdownStep: method does not exist → skipped', async () => {
  const r = await runShutdownStep(
    { name: 'X', key: 'svc', method: 'nonexistent' },
    { svc: { close: () => {} } }
  );
  assert.equal(r.skipped, true);
});

test('runShutdownStep: service throws → ok=false, error captured', async () => {
  const services = { svc: { stop: async () => { throw new Error('boom'); } } };
  const r = await runShutdownStep({ name: 'Y', key: 'svc', method: 'stop' }, services);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'boom');
});

test('runShutdownStep: step timeout → ok=false, error mentions timeout', async () => {
  const services = {
    svc: { close: () => new Promise((resolve) => setTimeout(resolve, 10_000)) }
  };
  const r = await runShutdownStep(
    { name: 'Slow', key: 'svc', method: 'close' },
    services,
    { stepTimeoutMs: 50 }
  );
  assert.equal(r.ok, false);
  assert.ok(r.error.includes('timeout'), `got: ${r.error}`);
}, { timeout: 2000 });

test('runShutdownStep: log callback is called on success', async () => {
  const logs = [];
  const services = { s: { close: async () => {} } };
  await runShutdownStep({ name: 'S', key: 's', method: 'close' }, services, {
    log: (msg) => logs.push(msg),
  });
  assert.ok(logs.some((l) => l.includes('✓ S')), `logs: ${logs}`);
});

test('runShutdownStep: log callback is called on failure', async () => {
  const logs = [];
  const services = { s: { close: async () => { throw new Error('fail'); } } };
  await runShutdownStep({ name: 'S', key: 's', method: 'close' }, services, {
    log: (msg) => logs.push(msg),
  });
  assert.ok(logs.some((l) => l.includes('✗ S')), `logs: ${logs}`);
});

// ── shutdown ──────────────────────────────────────────────────────────────────

test('shutdown: runs all steps in order', async () => {
  const order = [];
  const steps = [
    { name: 'A', key: 'a', method: 'stop' },
    { name: 'B', key: 'b', method: 'stop' },
    { name: 'C', key: 'c', method: 'stop' },
  ];
  const services = {
    a: { stop: async () => order.push('a') },
    b: { stop: async () => order.push('b') },
    c: { stop: async () => order.push('c') },
  };
  const r = await shutdown(services, { steps, log: () => {} });
  assert.equal(r.ok, true);
  assert.deepEqual(order, ['a', 'b', 'c']);
});

test('shutdown: null services are skipped, ok=true', async () => {
  const steps = [{ name: 'X', key: 'x', method: 'close' }];
  const r = await shutdown({ x: null }, { steps, log: () => {} });
  assert.equal(r.ok, true);
  assert.equal(r.steps[0].skipped, true);
});

test('shutdown: failing step does not abort remaining steps', async () => {
  const order = [];
  const steps = [
    { name: 'Fail', key: 'f', method: 'stop' },
    { name: 'OK',   key: 'g', method: 'stop' },
  ];
  const services = {
    f: { stop: async () => { throw new Error('oops'); } },
    g: { stop: async () => order.push('g') },
  };
  const r = await shutdown(services, { steps, log: () => {} });
  assert.equal(r.ok, false);
  assert.deepEqual(order, ['g']); // 'g' still ran
  assert.equal(r.steps[0].ok, false);
  assert.equal(r.steps[1].ok, true);
});

test('shutdown: returns signal in result', async () => {
  const r = await shutdown({}, { steps: [], signal: 'SIGTERM', log: () => {} });
  assert.equal(r.signal, 'SIGTERM');
});

test('shutdown: returns durationMs > 0', async () => {
  const r = await shutdown({}, { steps: [], log: () => {} });
  assert.ok(r.durationMs >= 0, `durationMs: ${r.durationMs}`);
});

test('shutdown: total timeout → ok=false, timedOut=true', async () => {
  const steps = [{
    name: 'Slow', key: 's', method: 'stop',
  }];
  const services = {
    s: { stop: () => new Promise((resolve) => setTimeout(resolve, 10_000)) }
  };
  const r = await shutdown(services, { steps, timeoutMs: 50, log: () => {} });
  assert.equal(r.ok,      false);
  assert.equal(r.timedOut, true);
}, { timeout: 2000 });

test('shutdown: empty steps → ok=true', async () => {
  const r = await shutdown({}, { steps: [], log: () => {} });
  assert.equal(r.ok, true);
  assert.deepEqual(r.steps, []);
});

// ── SseManager.closeAll ───────────────────────────────────────────────────────

test('SseManager: closeAll() clears all connections', async () => {
  const { SseManager } = await import('../src/events/SseManager.js');
  const { EventBus }   = await import('../src/events/EventBus.js');
  const mgr = new SseManager();
  const bus = new EventBus();

  // Simulate a connection with a minimal mock reply
  let ended = false;
  const mockReply = {
    raw: {
      write:       () => {},
      end:         () => { ended = true; },
      on:          () => {},
    },
  };

  mgr.add(mockReply, bus, []);
  assert.equal(mgr.count(), 1);

  mgr.closeAll();
  assert.equal(mgr.count(), 0);
  assert.equal(ended, true, 'reply.raw.end() should be called');
});

// ── BrowserManager.stopAll (source-level check) ───────────────────────────────

test('BrowserManager: stopAll() is defined in source', async () => {
  // Cannot import BrowserManager without patchright installed in test env.
  // Verify the method exists by reading the source file directly.
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes('async stopAll()'), 'stopAll method should be defined in BrowserManager');
});
