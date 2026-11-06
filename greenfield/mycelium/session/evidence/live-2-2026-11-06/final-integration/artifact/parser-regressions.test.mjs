import test from 'node:test';
import assert from 'node:assert/strict';
import { expand } from './frontier.mjs';

test('Unicode case expansion before raw text does not corrupt parser offsets', () => {
  const links = expand({url:'https://example.test/', html:'İ<script><a href="/fake">fake</a></script><a href="/real">出店</a>'});
  assert.deepEqual(links, [{url:'https://example.test/real',text:'出店',from:'https://example.test/'}]);
});

test('text character references cannot be synthesized across markup', () => {
  const [link] = expand({url:'https://example.test/', html:'<a href="/real">&am<b>p;</b> &amp; &#x1F600;</a>'});
  assert.equal(link.text, '&amp; & 😀');
});

test('plaintext consumes the remainder without introducing anchor tags', () => {
  assert.deepEqual(expand({url:'https://example.test/',html:'<plaintext><a href="/fake">fake</a>'}), []);
});
