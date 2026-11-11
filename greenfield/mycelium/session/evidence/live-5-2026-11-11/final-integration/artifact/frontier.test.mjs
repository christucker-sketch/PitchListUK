import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { expand } from './frontier.mjs';

const pages = JSON.parse(readFileSync(new URL('./pages.json', import.meta.url), 'utf8'));

const a = expand(pages[0]);
assert.equal(a.length, 2);
assert.equal(a[0].url, 'https://example.test/de/markt?jahr=2027');
assert.equal(a[0].text, 'Marché → Markt');
assert.equal(a[0].from, 'https://example.test/fr/agenda/');
assert.equal(a[1].url, new URL('/ja/祭り', 'https://example.test/').href);
assert.equal(a[1].text, '出店案内');

const b = expand(pages[1]);
assert.deepEqual(b.map(x => x.url), ['https://example.test/fr/agenda/']);
assert.deepEqual(expand(pages[1], ['https://example.test/fr/agenda/#x']), []);

const c = expand({ url: 'https://example.test/', html:
  '<a href="https://u:p@example.test/x">cred</a><a href="mailto:a@b">m</a><a href="data:text/html,x">d</a>' +
  '<a href="  JAVASCRIPT:alert(1)">j</a><a href="ftp://example.test/">f</a><a href="/y#a">y1</a><a href="/y#b">y2</a>' +
  '<a title=">" href="/z?q=1&amp;r=2"><b>Zé</b>  &amp; co</a>' });
assert.deepEqual(c, [
  { url: 'https://example.test/y', text: 'y1', from: 'https://example.test/' },
  { url: 'https://example.test/z?q=1&r=2', text: 'Zé & co', from: 'https://example.test/' },
]);
assert.deepEqual(expand({ url: 'javascript:1', html: '<a href="/x">x</a>' }), []);

// Hidden regions, entity-encoded fragment-only and credential links.
const d = expand({ url: 'https://example.test/a/', html:
  '<!-- <a href="/c">c</a> --><script>var s="<a href=/s>s</a>";</script><style>/*<a href="/st">*/</style>' +
  '<a href=" &#35;top">frag</a><a href="https://user@example.test/">u</a><a href="https://&#117;:p@example.test/">e</a>' +
  '<a href="//other.test/p?κ=1">καλημέρα</a>' });
assert.deepEqual(d, [{ url: 'https://other.test/p?%CE%BA=1', text: 'καλημέρα', from: 'https://example.test/a/' }]);
console.log('ok');
