import test from 'node:test';
import assert from 'node:assert/strict';
import { expand } from './frontier.mjs';

const url = 'https://example.test/fr/agenda/';
const run = (html, seen = []) => expand({ url, html }, seen);

test('named character references preserve multilingual breadcrumb labels', () => {
  assert.deepEqual(run('<a href="/fr">caf&eacute; &rarr; march&eacute;</a>'), [
    { url: 'https://example.test/fr', text: 'café → marché', from: url },
  ]);
});

test('ambiguous semicolonless references in attributes preserve query names', () => {
  assert.deepEqual(run('<a href="/q?a=1&amp=2">query</a>'), [
    { url: 'https://example.test/q?a=1&amp=2', text: 'query', from: url },
  ]);
});

test('character references decode once, without turning escaped text into markup', () => {
  assert.deepEqual(run('<a href="/q?x=&amp;amp;">&lt;b&gt;出店&lt;/b&gt; &amp;amp;</a>'), [
    { url: 'https://example.test/q?x=&amp;', text: '<b>出店</b> &amp;', from: url },
  ]);
});

test('duplicate attributes keep the first href, including when it is unsafe', () => {
  assert.deepEqual(run('<a href="javascript:alert(1)" href="/safe">ignore</a>'), []);
  assert.deepEqual(run('<a href="/first" HREF="/second">first</a>'), [
    { url: 'https://example.test/first', text: 'first', from: url },
  ]);
});

test('URL canonicalization deduplicates default ports and path dot segments', () => {
  assert.deepEqual(run('<a href="https://EXAMPLE.test:443/a/../d#one">first</a><a href="/d#two">second</a>'), [
    { url: 'https://example.test/d', text: 'first', from: url },
  ]);
});

test('distinct query strings remain separate frontier entries', () => {
  assert.deepEqual(run('<a href="/q?lang=fr">français</a><a href="/q?lang=ja">日本語</a>',
    ['https://example.test/q?lang=fr#old']), [
    { url: 'https://example.test/q?lang=ja', text: '日本語', from: url },
  ]);
});

test('encoded credentials are rejected after URL parsing', () => {
  assert.deepEqual(run('<a href="https://%75ser@example.test/x">bad</a><a href="//:secret@example.test/y">bad</a>'), []);
});

test('entity-encoded fragment-only hrefs are rejected after decoding', () => {
  assert.deepEqual(run('<a href="&#35;top">top</a><a href="&#9;&#35;other">other</a>'), []);
});

test('an explicit self URL is filtered only when supplied in seen', () => {
  const html = '<a href="/fr/agenda/#label">agenda</a>';
  assert.deepEqual(run(html), [{ url, text: 'agenda', from: url }]);
  assert.deepEqual(run(html, [url]), []);
});

test('unknown entity names cannot resolve inherited object properties', () => {
  assert.deepEqual(run('<a href="/q?x=&constructor;">&constructor;</a>'), [
    { url: 'https://example.test/q?x=&constructor;', text: '&constructor;', from: url },
  ]);
});

test('EOF inside an anchor start tag never creates a breadcrumb', () => {
  for (const html of ['<a href="', '<a href="/unfinished"', '<a href=/unfinished']) {
    assert.deepEqual(run(html), [], html);
  }
});
