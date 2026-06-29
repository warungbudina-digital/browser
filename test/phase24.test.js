import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ResponseTransformer, applyTransforms, VALID_OPS } from '../src/browser/ResponseTransformer.js';

// ── VALID_OPS export ──────────────────────────────────────────────────────────

test('VALID_OPS: is a Set containing all 6 transform ops', () => {
  assert.ok(VALID_OPS instanceof Set);
  for (const op of ['set-status', 'set-header', 'remove-header', 'replace-body', 'prepend-body', 'append-body']) {
    assert.ok(VALID_OPS.has(op), `expected VALID_OPS to contain "${op}"`);
  }
  assert.equal(VALID_OPS.size, 6);
});

// ── ResponseTransformer: add ──────────────────────────────────────────────────

test('ResponseTransformer: add returns rule with id, addedAt, hits=0', () => {
  const rule = new ResponseTransformer().add({ pattern: '**', transforms: [{ op: 'set-status', status: 200 }] });
  assert.ok(rule.id,       'id should be set');
  assert.ok(rule.addedAt,  'addedAt should be set');
  assert.equal(rule.hits,  0);
  assert.ok(Array.isArray(rule.transforms));
});

test('ResponseTransformer: add stores pattern and priority', () => {
  const rule = new ResponseTransformer().add({ pattern: '**/*.json', transforms: [{ op: 'set-status', status: 200 }], priority: 5 });
  assert.equal(rule.pattern,  '**/*.json');
  assert.equal(rule.priority, 5);
});

test('ResponseTransformer: add without pattern throws', () => {
  assert.throws(() => new ResponseTransformer().add({ transforms: [{ op: 'set-status', status: 200 }] }), /pattern/i);
});

test('ResponseTransformer: add with invalid pattern type throws', () => {
  assert.throws(() => new ResponseTransformer().add({ pattern: 123, transforms: [{ op: 'set-status', status: 200 }] }), /pattern/i);
});

test('ResponseTransformer: add without transforms throws', () => {
  assert.throws(() => new ResponseTransformer().add({ pattern: '**' }), /transforms/i);
});

test('ResponseTransformer: add with empty transforms array throws', () => {
  assert.throws(() => new ResponseTransformer().add({ pattern: '**', transforms: [] }), /transforms/i);
});

test('ResponseTransformer: add with invalid op throws', () => {
  assert.throws(() => new ResponseTransformer().add({ pattern: '**', transforms: [{ op: 'delete-all' }] }), /invalid transform op/i);
});

test('ResponseTransformer: add with RegExp pattern succeeds', () => {
  const rule = new ResponseTransformer().add({ pattern: /\/api\//, transforms: [{ op: 'set-status', status: 200 }] });
  assert.ok(rule.id);
});

// ── ResponseTransformer: list, size, priority ─────────────────────────────────

test('ResponseTransformer: list returns empty array initially', () => {
  assert.deepEqual(new ResponseTransformer().list(), []);
});

test('ResponseTransformer: size reflects current count', () => {
  const rt = new ResponseTransformer();
  assert.equal(rt.size, 0);
  rt.add({ pattern: '**', transforms: [{ op: 'set-status', status: 200 }] });
  assert.equal(rt.size, 1);
});

test('ResponseTransformer: rules sorted by priority desc', () => {
  const rt = new ResponseTransformer();
  rt.add({ pattern: '**',      transforms: [{ op: 'set-status', status: 200 }], priority: 0 });
  rt.add({ pattern: '**/*.js', transforms: [{ op: 'set-status', status: 200 }], priority: 10 });
  rt.add({ pattern: '**/*.css',transforms: [{ op: 'set-status', status: 200 }], priority: 5 });
  const list = rt.list();
  assert.equal(list[0].priority, 10);
  assert.equal(list[1].priority, 5);
  assert.equal(list[2].priority, 0);
});

test('ResponseTransformer: list returns copies — transforms mutation does not affect store', () => {
  const rt   = new ResponseTransformer();
  rt.add({ pattern: '**', transforms: [{ op: 'set-status', status: 200 }] });
  const list = rt.list();
  list[0].transforms[0].status = 999;
  assert.equal(rt.list()[0].transforms[0].status, 200);
});

// ── ResponseTransformer: remove, clear ───────────────────────────────────────

test('ResponseTransformer: remove existing rule returns true', () => {
  const rt   = new ResponseTransformer();
  const rule = rt.add({ pattern: '**', transforms: [{ op: 'set-status', status: 200 }] });
  assert.equal(rt.remove(rule.id), true);
  assert.equal(rt.size, 0);
});

test('ResponseTransformer: remove non-existent id returns false', () => {
  assert.equal(new ResponseTransformer().remove('no-such-id'), false);
});

test('ResponseTransformer: clear removes all rules', () => {
  const rt = new ResponseTransformer();
  rt.add({ pattern: '**',      transforms: [{ op: 'set-status', status: 200 }] });
  rt.add({ pattern: '**/*.js', transforms: [{ op: 'set-status', status: 200 }] });
  rt.clear();
  assert.equal(rt.size, 0);
});

// ── ResponseTransformer: match ────────────────────────────────────────────────

test('ResponseTransformer: match returns null when no rules', () => {
  assert.equal(new ResponseTransformer().match('https://example.com'), null);
});

test('ResponseTransformer: match returns null when no rule matches', () => {
  const rt = new ResponseTransformer();
  rt.add({ pattern: '**/*.png', transforms: [{ op: 'set-status', status: 200 }] });
  assert.equal(rt.match('https://example.com/app.js'), null);
});

test('ResponseTransformer: match returns first matching rule and increments hits', () => {
  const rt   = new ResponseTransformer();
  const rule = rt.add({ pattern: '**/*.json', transforms: [{ op: 'set-status', status: 200 }] });
  const m    = rt.match('https://api.example.com/data.json');
  assert.ok(m);
  assert.equal(m.id, rule.id);
  assert.equal(rt.list()[0].hits, 1);
});

test('ResponseTransformer: higher-priority rule wins when two patterns match', () => {
  const rt = new ResponseTransformer();
  rt.add({ pattern: '**', transforms: [{ op: 'set-status', status: 200 }], priority: 0 });
  rt.add({ pattern: '**/*.json', transforms: [{ op: 'set-status', status: 201 }], priority: 10 });
  const m = rt.match('https://example.com/data.json');
  assert.equal(m.transforms[0].status, 201);
});

// ── applyTransforms ───────────────────────────────────────────────────────────

test('applyTransforms: set-status changes status code', () => {
  const result = applyTransforms([{ op: 'set-status', status: 404 }], { status: 200, headers: {}, body: '' });
  assert.equal(result.status, 404);
});

test('applyTransforms: set-header adds new header (key lowercased)', () => {
  const result = applyTransforms([{ op: 'set-header', key: 'X-Custom', value: 'yes' }], { status: 200, headers: {}, body: '' });
  assert.equal(result.headers['x-custom'], 'yes');
});

test('applyTransforms: set-header overwrites existing header', () => {
  const result = applyTransforms(
    [{ op: 'set-header', key: 'content-type', value: 'application/json' }],
    { status: 200, headers: { 'content-type': 'text/html' }, body: '' },
  );
  assert.equal(result.headers['content-type'], 'application/json');
});

test('applyTransforms: remove-header deletes existing header', () => {
  const result = applyTransforms(
    [{ op: 'remove-header', key: 'x-powered-by' }],
    { status: 200, headers: { 'x-powered-by': 'Express' }, body: '' },
  );
  assert.ok(!('x-powered-by' in result.headers), 'header should be removed');
});

test('applyTransforms: remove-header on missing key is a no-op', () => {
  const result = applyTransforms([{ op: 'remove-header', key: 'x-ghost' }], { status: 200, headers: {}, body: 'ok' });
  assert.equal(result.body, 'ok');
});

test('applyTransforms: replace-body replaces entire body', () => {
  const result = applyTransforms([{ op: 'replace-body', body: 'new content' }], { status: 200, headers: {}, body: 'old' });
  assert.equal(result.body, 'new content');
});

test('applyTransforms: prepend-body prepends to existing body', () => {
  const result = applyTransforms([{ op: 'prepend-body', body: 'prefix-' }], { status: 200, headers: {}, body: 'data' });
  assert.equal(result.body, 'prefix-data');
});

test('applyTransforms: append-body appends to existing body', () => {
  const result = applyTransforms([{ op: 'append-body', body: '-suffix' }], { status: 200, headers: {}, body: 'data' });
  assert.equal(result.body, 'data-suffix');
});

test('applyTransforms: multiple transforms applied in sequence', () => {
  const transforms = [
    { op: 'set-status',  status: 201 },
    { op: 'set-header',  key: 'X-Modified', value: '1' },
    { op: 'replace-body', body: 'fresh' },
    { op: 'append-body',  body: '!' },
  ];
  const result = applyTransforms(transforms, { status: 200, headers: {}, body: 'old' });
  assert.equal(result.status,              201);
  assert.equal(result.headers['x-modified'], '1');
  assert.equal(result.body,               'fresh!');
});

test('applyTransforms: does not mutate the input response object', () => {
  const input = { status: 200, headers: { 'content-type': 'text/plain' }, body: 'original' };
  applyTransforms([{ op: 'set-status', status: 500 }, { op: 'replace-body', body: 'changed' }], input);
  assert.equal(input.status, 200);
  assert.equal(input.body,   'original');
  assert.equal(input.headers['content-type'], 'text/plain');
});

test('applyTransforms: input headers not mutated by set-header', () => {
  const input = { status: 200, headers: {}, body: '' };
  applyTransforms([{ op: 'set-header', key: 'x-new', value: '1' }], input);
  assert.ok(!('x-new' in input.headers), 'input headers should be unchanged');
});

// ── BrowserService / BrowserManager source checks ─────────────────────────────

test('BrowserService source includes ResponseTransformer import', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('ResponseTransformer'), 'ResponseTransformer import missing');
});

test('BrowserService source includes transformAdd, transformList, transformRemove, transformClear', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('transformAdd'),    'transformAdd missing');
  assert.ok(src.includes('transformList'),   'transformList missing');
  assert.ok(src.includes('transformRemove'), 'transformRemove missing');
  assert.ok(src.includes('transformClear'),  'transformClear missing');
});

test('BrowserManager source includes transform-add, transform-list, transform-remove, transform-clear dispatch', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes("case 'transform-add'"),    'transform-add dispatch missing');
  assert.ok(src.includes("case 'transform-list'"),   'transform-list dispatch missing');
  assert.ok(src.includes("case 'transform-remove'"), 'transform-remove dispatch missing');
  assert.ok(src.includes("case 'transform-clear'"),  'transform-clear dispatch missing');
});

test('BrowserManager source includes transformActions in capabilities', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes('transformActions'), 'transformActions missing from capabilities');
});
