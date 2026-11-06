import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { expand } from './frontier.mjs';

const pages = JSON.parse(readFileSync(new URL('./pages.json', import.meta.url), 'utf8'));
const BASE = 'https://example.test/a/b/';
const urls = (html, seen = [], url = BASE) => expand({ url, html }, seen).map((c) => c.url);

test('fixture page 1: relative resolution, fragment stripped, query kept, Unicode', () => {
  const out = expand(pages[0]);
  assert.deepEqual(out, [
    { url: 'https://example.test/de/markt?jahr=2027', text: 'Marché → Markt', from: pages[0].url },
    { url: new URL('/ja/祭り', pages[0].url).href, text: '出店案内', from: pages[0].url },
  ]);
});

test('fixture page 2: fragment-only and javascript: rejected', () => {
  assert.deepEqual(expand(pages[1]), [
    { url: 'https://example.test/fr/agenda/', text: 'Exposants', from: pages[1].url },
  ]);
});

test('seen URLs are excluded, including when seen/link carry fragments', () => {
  assert.deepEqual(expand(pages[1], ['https://example.test/fr/agenda/']), []);
  assert.deepEqual(expand(pages[1], ['https://example.test/fr/agenda/#x']), []);
  assert.deepEqual(urls('<a href="/x#frag">x</a>', ['https://example.test/x']), []);
});

test('default seen argument and no mutation of inputs', () => {
  const seen = ['https://example.test/z'];
  const page = { url: BASE, html: '<a href="/y">y</a>' };
  const out = expand(page, seen);
  assert.deepEqual(seen, ['https://example.test/z']);
  assert.equal(out.length, 1);
  assert.deepEqual(expand(page).map((c) => c.url), ['https://example.test/y']);
});

test('duplicates collapse (after fragment stripping and resolution)', () => {
  assert.deepEqual(urls('<a href="/d">1</a><a href="/d#x">2</a><a href="../../d">3</a>'), [
    'https://example.test/d',
  ]);
});

test('non-web and credentialed URLs rejected', () => {
  const bad = [
    'javascript:alert(1)', ' JaVaScRiPt:alert(1)', 'java\tscript:alert(1)', 'data:text/html,hi',
    'mailto:a@b.c', 'ftp://example.test/f', 'file:///etc/passwd', 'tel:123',
    'https://user:pw@example.test/', 'https://user@example.test/', 'http://:pw@example.test/',
    '#', '#top', '  #top  ', 'http://', 'https://[bad',
  ];
  for (const h of bad) assert.deepEqual(urls(`<a href="${h}">x</a>`), [], h);
});

test('http and protocol-relative links accepted', () => {
  assert.deepEqual(urls('<a href="http://other.test/p?q=1">o</a><a href="//cdn.test/z">c</a>'), [
    'http://other.test/p?q=1',
    'https://cdn.test/z',
  ]);
});

test('entity-encoded hrefs are decoded once', () => {
  assert.deepEqual(urls('<a href="/s?a=1&amp;b=2">s</a><a href="&#x2F;e">e</a>'), [
    'https://example.test/s?a=1&b=2',
    'https://example.test/e',
  ]);
});

test('attribute syntax variants: case, single/unquoted, other attrs, quoted >', () => {
  assert.deepEqual(
    urls(`<A HREF='/one'>1</A><a href=/two>2</a><a title="x>y" href="/three">3</a><a class=x\nhref = "/four" >4</a>`),
    ['https://example.test/one', 'https://example.test/two', 'https://example.test/three', 'https://example.test/four'],
  );
});

test('href-like attributes that are not href are ignored', () => {
  assert.deepEqual(urls('<a data-href="/no">n</a><a xhref="/no2">n</a><area href="/no3"><link href="/no4">'), []);
  assert.deepEqual(urls('<abbr href="/no5">n</abbr><a title="href=/no6">n</a>'), []);
});

test('anchors inside comments, script, style, textarea are ignored', () => {
  const html =
    '<!-- <a href="/c">c</a> -->' +
    '<script>var s = \'<a href="/s">s</a>\';</script>' +
    '<style>/* <a href="/st">x</a> */</style>' +
    '<textarea><a href="/t">t</a></textarea>' +
    '<a href="/real">real</a>';
  assert.deepEqual(urls(html), ['https://example.test/real']);
});

test('anchor text: nested tags stripped, entities decoded, whitespace collapsed', () => {
  const out = expand({ url: BASE, html: '<a href="/t">\n  <b>Caf&eacute;</b>&nbsp;&amp; <i>Bar</i>\t&#x1F600; </a>' });
  assert.equal(out.length, 1);
  assert.equal(out[0].text, 'Café & Bar 😀');
});

test('first text wins on duplicate', () => {
  const out = expand({ url: BASE, html: '<a href="/d">first</a><a href="/d">second</a>' });
  assert.deepEqual(out.map((c) => c.text), ['first']);
});

test('whitespace around href is trimmed', () => {
  assert.deepEqual(urls('<a href="  /w  ">w</a><a href="\n/n\n">n</a>'), [
    'https://example.test/w',
    'https://example.test/n',
  ]);
});

test('malformed / hostile html does not throw and stays linear', () => {
  for (const html of ['<a href="/x', '<a', '<a href="/y">unterminated', '<<<>>>', '<!--', '', null, undefined]) {
    assert.doesNotThrow(() => expand({ url: BASE, html }));
  }
  const big = '<a href="'.repeat(20000) + '<a ' + ' '.repeat(50000) + '<!--'.repeat(20000);
  const t0 = Date.now();
  expand({ url: BASE, html: big });
  assert.ok(Date.now() - t0 < 2000, 'should not backtrack catastrophically');
});

test('results are plain records with exactly url,text,from', () => {
  const [c] = expand({ url: BASE + '#frag', html: '<a href="x">x</a>' });
  assert.deepEqual(Object.keys(c).sort(), ['from', 'text', 'url']);
  assert.equal(c.url, 'https://example.test/a/b/x');
});
