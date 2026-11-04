import test from 'node:test';
import assert from 'node:assert/strict';
import { expand } from './frontier.mjs';

const base = 'https://example.test/fr/agenda/';
const page = html => ({ url: base, html });

test('resolves multilingual links, preserves queries, strips fragments, and deduplicates', () => {
  assert.deepEqual(expand(page(
    '<a href="../../de/markt?jahr=2027#stand">Marché → Markt</a>' +
    '<a href="/ja/祭り">出店案内</a>' +
    '<a href="https://example.test/de/markt?jahr=2027#other">duplicate</a>'
  )), [
    { url: 'https://example.test/de/markt?jahr=2027', text: 'Marché → Markt', from: base },
    { url: 'https://example.test/ja/%E7%A5%AD%E3%82%8A', text: '出店案内', from: base }
  ]);
});

test('rejects fragment-only, credentialed, and non-web destinations', () => {
  const html = [
    '#top', '  #top', 'javascript:alert(1)', 'data:text/plain,hello',
    'mailto:a@example.test', 'ftp://example.test/x',
    'https://user:secret@example.test/x', '//user@example.test/x'
  ].map(href => '<a href="' + href + '">unsafe</a>').join('');
  assert.deepEqual(expand(page(html)), []);
});

test('normalizes visited URL fragments while retaining query distinctions', () => {
  assert.deepEqual(expand(page(
    '<a href="/done#next">visited</a><a href="/done?q=2#next">new query</a>'
  ), ['https://example.test/done#old']), [
    { url: 'https://example.test/done?q=2', text: 'new query', from: base }
  ]);
});

test('handles quoted greater-than characters and HTML entities without losing Unicode', () => {
  assert.deepEqual(expand(page(
    '<a title="1 > 0" href="/ok?a=1&amp;b=2">日本語 <b>市場</b> &amp; café &#x1F30D;</a>'
  )), [
    { url: 'https://example.test/ok?a=1&b=2', text: '日本語 市場 & café 🌍', from: base }
  ]);
});

test('does not treat comments or raw script/style text as links', () => {
  assert.deepEqual(expand(page(
    '<!-- <a href="/comment">fake</a> -->' +
    '<script>const s = "<a href=\'/script\'>fake</a>";</script>' +
    '<style>/* <a href="/style">fake</a> */</style>' +
    '<a href="/real">حقيقي</a>'
  )), [{ url: 'https://example.test/real', text: 'حقيقي', from: base }]);
});

test('accepts uppercase tags, single quotes, unquoted hrefs, and protocol-relative HTTPS', () => {
  assert.deepEqual(expand(page(
    "<A HREF='/one'>一</A><a href=/two>二</a><a href=//other.test/three>三</a>"
  )), [
    { url: 'https://example.test/one', text: '一', from: base },
    { url: 'https://example.test/two', text: '二', from: base },
    { url: 'https://other.test/three', text: '三', from: base }
  ]);
});

test('distinguishes href from data attributes and respects first duplicate attribute', () => {
  assert.deepEqual(expand(page(
    '<a data-href="/fake">none</a>' +
    '<a href="/first" href="/second">first</a>' +
    '<a href="&#35;top">fragment</a>' +
    '<a href="java&#x73;cript:alert(1)">script</a>'
  )), [{ url: 'https://example.test/first', text: 'first', from: base }]);
});
