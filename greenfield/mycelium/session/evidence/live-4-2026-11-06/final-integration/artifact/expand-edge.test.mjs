import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { expand } from './frontier.mjs';

const pages = JSON.parse(readFileSync(new URL('./pages.json', import.meta.url), 'utf8'));
const P = 'https://example.test/fr/agenda/';
const urls = (r) => r.map((b) => b.url);

test('fixture page 1: relative resolution, fragment stripped, query kept, Unicode text', () => {
  assert.deepEqual(expand(pages[0]), [
    { url: 'https://example.test/de/markt?jahr=2027', text: 'Marché → Markt', from: P },
    { url: 'https://example.test/ja/%E7%A5%AD%E3%82%8A', text: '出店案内', from: P },
  ]);
});

test('fixture page 2: fragment-only and javascript: rejected', () => {
  assert.deepEqual(expand(pages[1]), [
    { url: 'https://example.test/fr/agenda/', text: 'Exposants', from: 'https://example.test/de/markt' },
  ]);
});

test('seen entries are normalized (fragment, Unicode encoding) before comparison', () => {
  const r = expand(pages[0], ['https://example.test/ja/祭り#x', 'https://example.test/de/markt?jahr=2027']);
  assert.deepEqual(r, []);
  // differing query is a different URL
  assert.equal(expand(pages[0], ['https://example.test/de/markt']).length, 2);
});

test('entity-encoded ampersand in href and entities in text', () => {
  const r = expand({ url: P, html: '<a href="/q?a=1&amp;b=2">A &amp; B &#x2192; &#8364;</a>' });
  assert.deepEqual(r, [{ url: 'https://example.test/q?a=1&b=2', text: 'A & B → €', from: P }]);
});

test("quoted '>' inside attribute does not end the tag", () => {
  const r = expand({ url: P, html: '<a title="x>y" href="/ok">ok</a>' });
  assert.deepEqual(urls(r), ['https://example.test/ok']);
  assert.equal(r[0].text, 'ok');
});

test('uppercase tag/attr and unquoted values', () => {
  assert.deepEqual(urls(expand({ url: P, html: '<A HREF=/x?y=1>X</A>' })), ['https://example.test/x?y=1']);
});

test('data-href and other *href attributes are not links', () => {
  assert.deepEqual(expand({ url: P, html: '<a data-href="/no">n</a><a xhref="/no2">n</a>' }), []);
});

test('anchors in comments, script, style are ignored', () => {
  const html = '<!-- <a href="/c">c</a> --><script>var s="<a href=/s>s</a>"</script>' +
    '<style>/* <a href="/st"> */</style><a href="/real">real</a>';
  assert.deepEqual(urls(expand({ url: P, html })), ['https://example.test/real']);
});

test('credentialed and non-web URLs rejected', () => {
  const html = '<a href="https://u:p@example.test/">1</a><a href="http://u@example.test/">2</a>' +
    '<a href="mailto:a@b.test">3</a><a href="  JavaScript:alert(1)">4</a><a href="data:text/html,x">5</a>' +
    '<a href="ftp://example.test/">6</a><a href="//other.test/p">7</a>';
  assert.deepEqual(urls(expand({ url: P, html })), ['https://other.test/p']);
});

test('whitespace-padded fragment-only href rejected', () => {
  assert.deepEqual(expand({ url: P, html: '<a href="  #top">t</a><a href="#">e</a>' }), []);
});

test('dedupe keeps first occurrence (fragments collapse)', () => {
  const r = expand({ url: P, html: '<a href="/d#1">first</a><a href="/d#2">second</a><a href="https://example.test/d">third</a>' });
  assert.deepEqual(r, [{ url: 'https://example.test/d', text: 'first', from: P }]);
});

test('nested markup stripped and whitespace collapsed in text', () => {
  const r = expand({ url: P, html: '<a href="/n">\n  <b>Grüße</b>\t <i>aus</i>  Köln </a>' });
  assert.equal(r[0].text, 'Grüße aus Köln');
});

test('hostile input does not throw', () => {
  assert.deepEqual(expand({ url: 'not a url', html: '<a href="/x">x</a>' }), []);
  assert.deepEqual(expand({ url: P, html: null }), []);
  assert.deepEqual(expand({ url: P, html: '<a href="http://[bad">x</a><a href="' }), []);
  assert.deepEqual(expand(null), []);
});
