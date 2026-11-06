import test from 'node:test';
import assert from 'node:assert/strict';
import { expand } from './frontier.mjs';
const page = html => ({ url: 'https://example.test/', html });
test('bogus comments and declarations do not expose anchors', () => {
  assert.deepEqual(expand(page('<?fake <a href="/bad">x</a><!fake <a href="/bad2">y</a><a href="/ok">ok</a>')).map(x => x.url), ['https://example.test/ok']);
});
test('raw text offsets survive Unicode case expansion before and inside blocks', () => {
  const out = expand(page('İ<script>İ<a href="/bad">bad</a></script><a href="/ok">日本語</a>'));
  assert.deepEqual(out, [{ url: 'https://example.test/ok', text: '日本語', from: 'https://example.test/' }]);
});
test('raw text closing tags require a name boundary', () => {
  assert.deepEqual(expand(page('<script></scripture><a href="/bad">bad</a></script><a href="/ok">ok</a>')).map(x => x.url), ['https://example.test/ok']);
});
