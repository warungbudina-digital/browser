import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTextContent,
  buildMetadata,
  buildLinks,
  summarize,
} from '../src/browser/ContentExtractor.js';

// ── buildTextContent ──────────────────────────────────────────────────────────

test('buildTextContent: empty array → empty result', () => {
  const r = buildTextContent([]);
  assert.deepEqual(r.sections, []);
  assert.equal(r.text, '');
  assert.equal(r.stats.sections, 0);
});

test('buildTextContent: null/non-array → graceful empty', () => {
  const r = buildTextContent(null);
  assert.equal(r.text, '');
  assert.equal(r.stats.headings, 0);
});

test('buildTextContent: heading renders as markdown #', () => {
  const r = buildTextContent([{ type: 'heading', level: 1, text: 'Hello' }]);
  assert.ok(r.text.includes('# Hello'), `got: ${r.text}`);
  assert.equal(r.headings.length, 1);
  assert.equal(r.stats.headings, 1);
});

test('buildTextContent: h2 renders as ##', () => {
  const r = buildTextContent([{ type: 'heading', level: 2, text: 'Section' }]);
  assert.ok(r.text.startsWith('## Section'), `got: ${r.text}`);
});

test('buildTextContent: paragraph renders as plain text', () => {
  const r = buildTextContent([{ type: 'paragraph', text: 'Some content.' }]);
  assert.ok(r.text.includes('Some content.'), `got: ${r.text}`);
  assert.equal(r.stats.paragraphs, 1);
});

test('buildTextContent: unordered list renders with dashes', () => {
  const r = buildTextContent([{ type: 'list', ordered: false, items: ['A', 'B', 'C'] }]);
  assert.ok(r.text.includes('- A'), `got: ${r.text}`);
  assert.ok(r.text.includes('- C'), `got: ${r.text}`);
  assert.equal(r.stats.lists, 1);
});

test('buildTextContent: ordered list renders with numbers', () => {
  const r = buildTextContent([{ type: 'list', ordered: true, items: ['First', 'Second'] }]);
  assert.ok(r.text.includes('1. First'), `got: ${r.text}`);
  assert.ok(r.text.includes('2. Second'), `got: ${r.text}`);
});

test('buildTextContent: table renders pipe-separated rows', () => {
  const r = buildTextContent([{
    type: 'table',
    rows: [['Name', 'Age'], ['Alice', '30'], ['Bob', '25']],
  }]);
  assert.ok(r.text.includes('Name | Age'), `got: ${r.text}`);
  assert.ok(r.text.includes('Alice | 30'), `got: ${r.text}`);
  assert.equal(r.stats.tables, 1);
});

test('buildTextContent: blockquote renders with >', () => {
  const r = buildTextContent([{ type: 'quote', text: 'A famous quote.' }]);
  assert.ok(r.text.includes('> A famous quote.'), `got: ${r.text}`);
});

test('buildTextContent: code renders with backtick fences', () => {
  const r = buildTextContent([{ type: 'code', text: 'console.log("hi")' }]);
  assert.ok(r.text.includes('```'), `got: ${r.text}`);
  assert.ok(r.text.includes('console.log("hi")'), `got: ${r.text}`);
});

test('buildTextContent: mixed sections joined with double newline', () => {
  const r = buildTextContent([
    { type: 'heading', level: 1, text: 'Title' },
    { type: 'paragraph', text: 'Intro.' },
    { type: 'list', ordered: false, items: ['X', 'Y'] },
  ]);
  assert.equal(r.stats.sections, 3);
  const parts = r.text.split('\n\n');
  assert.equal(parts.length, 3);
});

test('buildTextContent: unknown type is ignored gracefully', () => {
  const r = buildTextContent([{ type: 'unknown', text: 'X' }]);
  assert.equal(r.text, '');
  assert.equal(r.stats.sections, 1); // included in valid sections
});

// ── buildMetadata ─────────────────────────────────────────────────────────────

test('buildMetadata: full meta object normalized', () => {
  const raw = {
    title: 'My Page', description: 'About it', canonical: 'https://x.test/',
    ogTitle: 'OG Title', ogImage: 'https://x.test/img.png', ogType: 'website',
    twitterCard: 'summary', keywords: 'a,b,c', author: 'Alice', robots: 'noindex',
    jsonLd: [{ '@type': 'Organization', name: 'X Corp' }],
  };
  const m = buildMetadata(raw);
  assert.equal(m.title, 'My Page');
  assert.equal(m.description, 'About it');
  assert.equal(m.canonical, 'https://x.test/');
  assert.equal(m.ogTitle, 'OG Title');
  assert.equal(m.ogImage, 'https://x.test/img.png');
  assert.equal(m.twitterCard, 'summary');
  assert.equal(m.keywords, 'a,b,c');
  assert.equal(m.author, 'Alice');
  assert.deepEqual(m.jsonLd, [{ '@type': 'Organization', name: 'X Corp' }]);
});

test('buildMetadata: null input → all empty strings', () => {
  const m = buildMetadata(null);
  assert.equal(m.title, '');
  assert.equal(m.description, '');
  assert.deepEqual(m.jsonLd, []);
});

test('buildMetadata: missing fields default to empty string', () => {
  const m = buildMetadata({ title: 'T' });
  assert.equal(m.title, 'T');
  assert.equal(m.ogImage, '');
  assert.equal(m.twitterCard, '');
  assert.deepEqual(m.jsonLd, []);
});

test('buildMetadata: non-array jsonLd coerced to []', () => {
  const m = buildMetadata({ jsonLd: 'bad' });
  assert.deepEqual(m.jsonLd, []);
});

// ── buildLinks ────────────────────────────────────────────────────────────────

test('buildLinks: empty array → empty result', () => {
  const r = buildLinks([]);
  assert.equal(r.stats.total, 0);
  assert.deepEqual(r.links, []);
});

test('buildLinks: null → graceful empty', () => {
  const r = buildLinks(null);
  assert.equal(r.stats.total, 0);
});

test('buildLinks: deduplicates links by href', () => {
  const r = buildLinks([
    { text: 'Home', href: 'https://x.test/', rel: '' },
    { text: 'Home2', href: 'https://x.test/', rel: '' }, // duplicate
    { text: 'About', href: 'https://x.test/about', rel: '' },
  ]);
  assert.equal(r.stats.total, 2);
});

test('buildLinks: classifies internal vs external with baseUrl', () => {
  const r = buildLinks([
    { text: 'Internal', href: 'https://x.test/page', rel: '' },
    { text: 'External', href: 'https://other.com/page', rel: '' },
  ], 'https://x.test/');
  assert.equal(r.stats.internal, 1);
  assert.equal(r.stats.external, 1);
  assert.equal(r.links[0].isExternal, false);
  assert.equal(r.links[1].isExternal, true);
});

test('buildLinks: no baseUrl → isExternal is null', () => {
  const r = buildLinks([{ text: 'A', href: 'https://x.test/', rel: '' }]);
  assert.equal(r.links[0].isExternal, null);
});

test('buildLinks: skips javascript: hrefs', () => {
  const r = buildLinks([
    { text: 'JS', href: 'javascript:void(0)', rel: '' },
    { text: 'Real', href: 'https://x.test/', rel: '' },
  ]);
  assert.equal(r.stats.total, 1);
  assert.equal(r.links[0].href, 'https://x.test/');
});

test('buildLinks: invalid baseUrl does not throw', () => {
  const r = buildLinks([{ text: 'X', href: 'https://x.test/', rel: '' }], 'not-a-url');
  assert.equal(r.links[0].isExternal, null);
});

test('buildLinks: rel attribute preserved', () => {
  const r = buildLinks([{ text: 'A', href: 'https://x.test/', rel: 'noopener noreferrer' }]);
  assert.equal(r.links[0].rel, 'noopener noreferrer');
});

// ── summarize ─────────────────────────────────────────────────────────────────

test('summarize: short text returned as-is', () => {
  const s = summarize('Hello world', 50);
  assert.equal(s, 'Hello world');
});

test('summarize: text at exact limit returned as-is', () => {
  const text = 'a'.repeat(500);
  assert.equal(summarize(text, 500), text);
});

test('summarize: long text truncated with ellipsis', () => {
  const text = 'word '.repeat(200).trim(); // 999 chars
  const s = summarize(text, 50);
  assert.ok(s.endsWith('...'), `got: ${s}`);
  assert.ok(s.length <= 50, `length ${s.length}`);
});

test('summarize: breaks at word boundary', () => {
  const s = summarize('the quick brown fox jumped over', 15);
  // "the quick br..." would be mid-word; should break at "the quick..."
  assert.ok(!s.includes('br'), `should not break mid-word: ${s}`);
  assert.ok(s.endsWith('...'), `got: ${s}`);
});

test('summarize: empty string → empty', () => {
  assert.equal(summarize(''), '');
  assert.equal(summarize(null), '');
  assert.equal(summarize(undefined), '');
});
