import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { expand } from './frontier.mjs';

const pages = JSON.parse(readFileSync(new URL('./pages.json', import.meta.url), 'utf8'));
const base = 'https://example.test/a/b';
const page = html => ({ url: base, html });
const urls = r => r.map(b => b.url);

test('pages.json fixtures', () => {
  assert.deepEqual(expand(pages[0]), [
    { url: 'https://example.test/de/markt?jahr=2027', text: 'Marché → Markt', from: 'https://example.test/fr/agenda/' },
    { url: 'https://example.test/ja/%E7%A5%AD%E3%82%8A', text: '出店案内', from: 'https://example.test/fr/agenda/' }
  ]);
  assert.deepEqual(expand(pages[1]), [
    { url: 'https://example.test/fr/agenda/', text: 'Exposants', from: 'https://example.test/de/markt' }
  ]);
  assert.deepEqual(expand(pages[1], ['https://example.test/fr/agenda/#x']), []);
});

test('href text inside another attribute value is not the href', () => {
  assert.deepEqual(urls(expand(page('<a title="see href=/evil" href="/good">g</a>'))), ['https://example.test/good']);
  assert.deepEqual(urls(expand(page("<a data-x='>href=/evil' href=/good>g</a>"))), ['https://example.test/good']);
});

test('textarea and title contents are raw text, not anchors', () => {
  assert.deepEqual(urls(expand(page(
    '<title><a href="/t">t</a></title><textarea><a href="/fake">fake</a></textarea><a href="/real">real</a>'
  ))), ['https://example.test/real']);
});

test('unclosed anchor does not swallow the following anchor', () => {
  assert.deepEqual(expand(page('<a href="/one">one<a href="/two">two</a>')).map(b => [b.url, b.text]),
    [['https://example.test/one', 'one'], ['https://example.test/two', 'two']]);
});

test('the page itself counts as visited', () => {
  assert.deepEqual(urls(expand(page('<a href="">self</a><a href="b#x">self2</a><a href="?q=1">q</a>'))),
    ['https://example.test/a/b?q=1']);
});

test('obfuscated schemes are rejected', () => {
  const html = [' JaVaScript:alert(1)', 'java\tscript:alert(1)', 'java&#x09;script:alert(1)', 'file:///etc/passwd',
    'http://[bad', 'https://:pw@example.test/']
    .map(h => `<a href="${h}">x</a>`).join('');
  assert.deepEqual(expand(page(html)), []);
});

test('seen list is normalized (host case, Unicode path, fragment)', () => {
  assert.deepEqual(urls(expand(pages[0], ['https://EXAMPLE.test/ja/祭り#z'])), ['https://example.test/de/markt?jahr=2027']);
});

test('unknown entities are left as-is; whitespace and nbsp collapse', () => {
  assert.deepEqual(expand(page('<a href="/c">\n Caf&eacute;&nbsp;&nbsp; ok\t</a>'))[0].text, 'Caf&eacute; ok');
});

test('hostile or malformed input does not throw', () => {
  for (const p of [null, undefined, 42, {}, { url: 'javascript:1', html: '<a href="/x">' }, { url: base, html: 7 }]) {
    assert.deepEqual(expand(p), []);
  }
  assert.equal(expand(page('<a href="/x">x</a>'), null).length, 1);
  assert.equal(expand(page('<a href="/x">x</a>'), [null, 3, 'not a url']).length, 1);
  assert.doesNotThrow(() => expand(page('<a href="/x"' + '<a "'.repeat(2000))));
});
