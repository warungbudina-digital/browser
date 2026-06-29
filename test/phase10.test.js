import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { EventBus } from '../src/events/EventBus.js';
import { SseManager } from '../src/events/SseManager.js';

// ── EventBus ─────────────────────────────────────────────────────────────────

test('EventBus: publish + subscribe single topic', () => {
  const bus = new EventBus();
  const received = [];
  bus.subscribe('job.completed', (data) => received.push(data));
  bus.publish('job.completed', { jobId: 'abc', platform: 'instagram' });
  assert.equal(received.length, 1);
  assert.equal(received[0].jobId, 'abc');
});

test('EventBus: wildcard subscriber receives all events', () => {
  const bus = new EventBus();
  const received = [];
  bus.subscribeMany(['*'], (topic, data) => received.push({ topic, data }));
  bus.publish('job.started',   { jobId: '1' });
  bus.publish('alert.fired',   { platform: 'tiktok' });
  bus.publish('job.completed', { jobId: '2' });
  assert.equal(received.length, 3);
  assert.equal(received[0].topic, 'job.started');
  assert.equal(received[2].topic, 'job.completed');
});

test('EventBus: subscribeMany only receives selected topics', () => {
  const bus = new EventBus();
  const received = [];
  bus.subscribeMany(['job.completed', 'job.failed'], (topic, data) => received.push({ topic, data }));
  bus.publish('job.started',   { jobId: '1' });
  bus.publish('job.completed', { jobId: '2' });
  bus.publish('alert.fired',   { platform: 'instagram' });
  bus.publish('job.failed',    { jobId: '3' });
  assert.equal(received.length, 2);
  assert.equal(received[0].topic, 'job.completed');
  assert.equal(received[1].topic, 'job.failed');
});

test('EventBus: unsubscribe stops receiving events', () => {
  const bus = new EventBus();
  const received = [];
  const unsub = bus.subscribe('job.started', (data) => received.push(data));
  bus.publish('job.started', { jobId: 'a' });
  unsub();
  bus.publish('job.started', { jobId: 'b' });
  assert.equal(received.length, 1);
});

test('EventBus: subscribeMany unsubscribe works for all topics', () => {
  const bus = new EventBus();
  const received = [];
  const unsub = bus.subscribeMany(['job.completed', 'alert.fired'], (t, d) => received.push(d));
  bus.publish('job.completed', { jobId: 'x' });
  unsub();
  bus.publish('job.completed', { jobId: 'y' });
  bus.publish('alert.fired',   { platform: 'twitter' });
  assert.equal(received.length, 1);
});

test('EventBus: knownTopics returns published topic names', () => {
  const bus = new EventBus();
  // Need a listener for eventNames() to work
  bus.subscribe('job.queued',    () => {});
  bus.subscribe('job.completed', () => {});
  bus.publish('job.queued',    {});
  bus.publish('job.completed', {});
  const topics = bus.knownTopics();
  assert.ok(topics.includes('job.queued'));
  assert.ok(topics.includes('job.completed'));
  assert.ok(!topics.includes('*')); // wildcard harus difilter
});

// ── SseManager ───────────────────────────────────────────────────────────────

function makeFakeReply() {
  const written = [];
  const ee = new EventEmitter();
  return {
    raw: {
      write:  (chunk) => written.push(chunk),
      end:    () => ee.emit('close'),
      on:     (ev, fn) => ee.on(ev, fn),
      emit:   (ev) => ee.emit(ev),
    },
    written,
    triggerClose: () => ee.emit('close'),
  };
}

test('SseManager: count starts at 0', () => {
  const mgr = new SseManager();
  assert.equal(mgr.count(), 0);
});

test('SseManager: add increments connection count', () => {
  const bus = new EventBus();
  const mgr = new SseManager();
  const reply = makeFakeReply();
  mgr.add(reply, bus, ['*']);
  assert.equal(mgr.count(), 1);
});

test('SseManager: connection removed on close', () => {
  const bus = new EventBus();
  const mgr = new SseManager();
  const reply = makeFakeReply();
  mgr.add(reply, bus, ['*']);
  assert.equal(mgr.count(), 1);
  reply.triggerClose();
  assert.equal(mgr.count(), 0);
});

test('SseManager: fan-out delivers SSE-formatted event to connected client', () => {
  const bus   = new EventBus();
  const mgr   = new SseManager();
  const reply = makeFakeReply();
  mgr.add(reply, bus, ['job.completed']);

  bus.publish('job.completed', { jobId: 'test', platform: 'instagram' });

  const output = reply.written.join('');
  assert.ok(output.includes('event: job.completed'));
  assert.ok(output.includes('"jobId":"test"'));
});

test('SseManager: client does not receive events from unsubscribed topics', () => {
  const bus   = new EventBus();
  const mgr   = new SseManager();
  const reply = makeFakeReply();
  mgr.add(reply, bus, ['alert.fired']);

  bus.publish('job.completed', { jobId: 'x' });

  const output = reply.written.join('');
  assert.ok(!output.includes('job.completed'));
});

test('SseManager: broadcast sends to all connections', () => {
  const bus    = new EventBus();
  const mgr    = new SseManager();
  const reply1 = makeFakeReply();
  const reply2 = makeFakeReply();
  mgr.add(reply1, bus, ['*']);
  mgr.add(reply2, bus, ['*']);

  mgr.broadcast('system.announce', { msg: 'hello' });

  assert.ok(reply1.written.join('').includes('system.announce'));
  assert.ok(reply2.written.join('').includes('system.announce'));
});
