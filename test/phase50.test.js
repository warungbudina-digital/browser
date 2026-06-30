import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  filterByType,
  filterByName,
  filterRequired,
  filterDisabled,
  summarize,
} from '../src/browser/FormManager.js';

const fields = [
  { tag: 'input',    type: 'text',     name: 'username', id: 'u', value: '',  disabled: false, required: true  },
  { tag: 'input',    type: 'password', name: 'password', id: 'p', value: '',  disabled: false, required: true  },
  { tag: 'input',    type: 'email',    name: 'email',    id: 'e', value: '',  disabled: true,  required: false },
  { tag: 'select',   type: 'select-one', name: 'role',  id: 'r', value: 'user', disabled: false, required: false },
  { tag: 'input',    type: 'checkbox', name: 'agree',   id: 'a', value: 'on', disabled: false, required: true  },
  { tag: 'textarea', type: 'textarea', name: 'bio',     id: 'b', value: '',  disabled: true,  required: false },
];

// ── filterByType ──────────────────────────────────────────────────────────────

test('filterByType: returns only matching type', () => {
  const result = filterByType(fields, 'text');
  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'username');
});

test('filterByType: select-one', () => {
  assert.equal(filterByType(fields, 'select-one').length, 1);
});

test('filterByType: no match returns empty array', () => {
  assert.deepEqual(filterByType(fields, 'file'), []);
});

test('filterByType: empty fields returns empty array', () => {
  assert.deepEqual(filterByType([], 'text'), []);
});

// ── filterByName ──────────────────────────────────────────────────────────────

test('filterByName: substring match', () => {
  const result = filterByName(fields, 'pass');
  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'password');
});

test('filterByName: RegExp match', () => {
  const result = filterByName(fields, /^(username|email)$/);
  assert.equal(result.length, 2);
});

test('filterByName: no match returns empty array', () => {
  assert.deepEqual(filterByName(fields, 'zzz'), []);
});

test('filterByName: skips fields with null name', () => {
  const f = [{ name: null, type: 'submit' }, { name: 'foo', type: 'text' }];
  assert.equal(filterByName(f, 'foo').length, 1);
});

// ── filterRequired ────────────────────────────────────────────────────────────

test('filterRequired: returns only required fields', () => {
  const result = filterRequired(fields);
  assert.equal(result.length, 3);
  assert.ok(result.every((f) => f.required));
});

test('filterRequired: empty when none required', () => {
  const f = [{ required: false }, { required: false }];
  assert.deepEqual(filterRequired(f), []);
});

// ── filterDisabled ────────────────────────────────────────────────────────────

test('filterDisabled: returns only disabled fields', () => {
  const result = filterDisabled(fields);
  assert.equal(result.length, 2);
  assert.ok(result.every((f) => f.disabled));
});

test('filterDisabled: empty when none disabled', () => {
  const f = [{ disabled: false }, { disabled: false }];
  assert.deepEqual(filterDisabled(f), []);
});

// ── summarize ─────────────────────────────────────────────────────────────────

test('summarize: empty fields', () => {
  const s = summarize([]);
  assert.equal(s.total, 0);
  assert.deepEqual(s.byType, {});
  assert.equal(s.required, 0);
  assert.equal(s.disabled, 0);
});

test('summarize: total matches field count', () => {
  assert.equal(summarize(fields).total, 6);
});

test('summarize: byType counts correctly', () => {
  const s = summarize(fields);
  assert.equal(s.byType.text,       1);
  assert.equal(s.byType.password,   1);
  assert.equal(s.byType.email,      1);
  assert.equal(s.byType.checkbox,   1);
  assert.equal(s.byType.textarea,   1);
  assert.equal(s.byType['select-one'], 1);
});

test('summarize: required count', () => {
  assert.equal(summarize(fields).required, 3);
});

test('summarize: disabled count', () => {
  assert.equal(summarize(fields).disabled, 2);
});

// ── source checks ─────────────────────────────────────────────────────────────

test('BrowserService imports FormManager', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('FormManager'), 'FormManager import missing');
});

test('BrowserService includes formList method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('async formList'), 'formList missing');
});

test('BrowserService includes formFill method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('async formFill'), 'formFill missing');
});

test('BrowserService includes formValues method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('async formValues'), 'formValues missing');
});

test('BrowserService includes formSubmit method', () => {
  const src = readFileSync(new URL('../src/browser/BrowserService.js', import.meta.url), 'utf8');
  assert.ok(src.includes('async formSubmit'), 'formSubmit missing');
});

test('BrowserManager includes form-list dispatch', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes("case 'form-list'"), 'form-list dispatch missing');
});

test('BrowserManager includes formActions in capabilities', () => {
  const src = readFileSync(new URL('../src/browser/BrowserManager.js', import.meta.url), 'utf8');
  assert.ok(src.includes('formActions'), 'formActions missing from capabilities');
});
