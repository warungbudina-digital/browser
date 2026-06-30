import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  INTERACTIVE_ROLES, HEADING_ROLES,
  flattenTree, findByRole, findByName,
  findMissingNames, findHeadingOrderViolations,
  findDisabled, groupByRole, summarize,
} from '../src/browser/AccessibilityAudit.js';

// helper: build a minimal AX tree
const node = (role, name, extra = {}) => ({ role, name, ...extra });
const tree = (root, ...children) => ({ ...root, children });

// ── constants ─────────────────────────────────────────────────────────────────

test('INTERACTIVE_ROLES contains button, link, textbox', () => {
  assert.ok(INTERACTIVE_ROLES.has('button'));
  assert.ok(INTERACTIVE_ROLES.has('link'));
  assert.ok(INTERACTIVE_ROLES.has('textbox'));
});

test('HEADING_ROLES contains heading', () => {
  assert.ok(HEADING_ROLES.has('heading'));
});

// ── flattenTree ───────────────────────────────────────────────────────────────

test('flattenTree: returns empty array for null', () => {
  assert.deepEqual(flattenTree(null), []);
});

test('flattenTree: flattens single node', () => {
  const result = flattenTree(node('button', 'Click me'));
  assert.equal(result.length, 1);
  assert.equal(result[0].role, 'button');
});

test('flattenTree: flattens nested tree DFS', () => {
  const root = tree(
    node('RootWebArea', ''),
    tree(node('heading', 'Title', { level: 1 })),
    node('button', 'Submit'),
  );
  const result = flattenTree(root);
  assert.equal(result.length, 3);
  assert.equal(result[0].role, 'RootWebArea');
  assert.equal(result[1].role, 'heading');
  assert.equal(result[2].role, 'button');
});

test('flattenTree: removes children field from nodes', () => {
  const root = tree(node('section', ''), node('button', 'Go'));
  const result = flattenTree(root);
  assert.ok(!Object.prototype.hasOwnProperty.call(result[0], 'children'));
});

test('flattenTree: deeply nested', () => {
  const root = tree(
    node('main', ''),
    tree(node('nav', ''), node('link', 'Home'), node('link', 'About')),
    node('button', 'Submit'),
  );
  const result = flattenTree(root);
  assert.equal(result.length, 5);
});

// ── findByRole ────────────────────────────────────────────────────────────────

test('findByRole: returns matching nodes', () => {
  const nodes = [node('button', 'OK'), node('link', 'Home'), node('button', 'Cancel')];
  assert.equal(findByRole(nodes, 'button').length, 2);
});

test('findByRole: case-insensitive', () => {
  const nodes = [node('Button', 'OK')];
  assert.equal(findByRole(nodes, 'button').length, 1);
});

test('findByRole: returns empty for no match', () => {
  const nodes = [node('button', 'OK')];
  assert.deepEqual(findByRole(nodes, 'heading'), []);
});

// ── findByName ────────────────────────────────────────────────────────────────

test('findByName: substring match', () => {
  const nodes = [node('button', 'Submit Form'), node('button', 'Cancel')];
  assert.equal(findByName(nodes, 'Submit').length, 1);
});

test('findByName: case-insensitive', () => {
  const nodes = [node('button', 'OK')];
  assert.equal(findByName(nodes, 'ok').length, 1);
});

test('findByName: returns empty for no match', () => {
  assert.deepEqual(findByName([node('button', 'OK')], 'xyz'), []);
});

// ── findMissingNames ──────────────────────────────────────────────────────────

test('findMissingNames: flags interactive nodes without name', () => {
  const nodes = [
    node('button', ''),
    node('button', 'Submit'),
    node('link',   null),
    node('heading', 'Title'),
  ];
  const result = findMissingNames(nodes);
  assert.equal(result.length, 2);
});

test('findMissingNames: skips non-interactive roles', () => {
  const nodes = [node('heading', ''), node('paragraph', '')];
  assert.deepEqual(findMissingNames(nodes), []);
});

test('findMissingNames: whitespace-only name is missing', () => {
  const nodes = [node('button', '   ')];
  assert.equal(findMissingNames(nodes).length, 1);
});

// ── findHeadingOrderViolations ────────────────────────────────────────────────

test('findHeadingOrderViolations: no violation for h1→h2→h3', () => {
  const nodes = [
    node('heading', 'A', { level: 1 }),
    node('heading', 'B', { level: 2 }),
    node('heading', 'C', { level: 3 }),
  ];
  assert.deepEqual(findHeadingOrderViolations(nodes), []);
});

test('findHeadingOrderViolations: violation for h1→h3', () => {
  const nodes = [
    node('heading', 'A', { level: 1 }),
    node('heading', 'B', { level: 3 }),
  ];
  const violations = findHeadingOrderViolations(nodes);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].prevLevel, 1);
  assert.equal(violations[0].level,     3);
});

test('findHeadingOrderViolations: h2→h2 is not a violation', () => {
  const nodes = [node('heading', 'A', { level: 2 }), node('heading', 'B', { level: 2 })];
  assert.deepEqual(findHeadingOrderViolations(nodes), []);
});

test('findHeadingOrderViolations: ignores non-heading nodes', () => {
  const nodes = [
    node('heading', 'A', { level: 1 }),
    node('button',  'Click'),
    node('heading', 'B', { level: 3 }),
  ];
  assert.equal(findHeadingOrderViolations(nodes).length, 1);
});

// ── findDisabled ──────────────────────────────────────────────────────────────

test('findDisabled: returns disabled interactive nodes', () => {
  const nodes = [
    node('button', 'OK',     { disabled: true }),
    node('button', 'Cancel', { disabled: false }),
    node('link',   'Home',   { disabled: true }),
  ];
  assert.equal(findDisabled(nodes).length, 2);
});

test('findDisabled: skips non-interactive roles', () => {
  const nodes = [node('heading', 'Title', { disabled: true })];
  assert.deepEqual(findDisabled(nodes), []);
});

// ── groupByRole ───────────────────────────────────────────────────────────────

test('groupByRole: groups correctly', () => {
  const nodes = [node('button', 'A'), node('link', 'B'), node('button', 'C')];
  const groups = groupByRole(nodes);
  assert.equal(groups['button'].length, 2);
  assert.equal(groups['link'].length,   1);
});

test('groupByRole: empty input returns empty object', () => {
  assert.deepEqual(groupByRole([]), {});
});

// ── summarize ─────────────────────────────────────────────────────────────────

test('summarize: returns total, byRole, missingNames, headingViolations', () => {
  const nodes = [
    node('heading', 'Title', { level: 1 }),
    node('button',  'OK'),
    node('button',  ''),
  ];
  const s = summarize(nodes);
  assert.equal(s.total, 3);
  assert.ok(Object.prototype.hasOwnProperty.call(s, 'byRole'));
  assert.ok(Array.isArray(s.missingNames));
  assert.ok(Array.isArray(s.headingViolations));
  assert.equal(s.missingNames.length, 1);
});

// ── source checks ─────────────────────────────────────────────────────────────

test('BrowserService imports AccessibilityAudit', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('AccessibilityAudit'), 'AccessibilityAudit import missing');
});

test('BrowserService includes axSnapshot method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('axSnapshot'), 'axSnapshot missing');
});

test('BrowserService includes axAudit method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('axAudit'), 'axAudit missing');
});

test('BrowserManager includes ax-snapshot dispatch', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes("case 'ax-snapshot'"), 'ax-snapshot dispatch missing');
});

test('BrowserManager includes axActions in capabilities', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes('axActions'), 'axActions missing from capabilities');
});
