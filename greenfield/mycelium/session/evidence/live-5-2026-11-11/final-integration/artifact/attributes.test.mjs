import assert from 'node:assert/strict';
import { expand } from './frontier.mjs';

const page = html => ({ url: 'https://example.test/base/', html });
assert.deepEqual(expand(page(`<a title="note href='/wrong'" href="/right">正しい</a>`)), [
  { url: 'https://example.test/right', text: '正しい', from: 'https://example.test/base/' }
]);
assert.deepEqual(expand(page(`<a title="href='/ghost'">No destination</a>`)), []);
assert.deepEqual(expand(page(`<a href="/first" href="/second">first</a>`)).map(x => x.url),
  ['https://example.test/first']);
assert.deepEqual(expand(page(`<a href href="/second">empty first</a>`)), []);
assert.deepEqual(expand(page(`<a disabled title="a > b" HREF='../x?q=1&amp;n=2#f'>&#x1F30D; &#26085;本</a>`)), [
  { url: 'https://example.test/x?q=1&n=2', text: '🌍 日本', from: 'https://example.test/base/' }
]);
