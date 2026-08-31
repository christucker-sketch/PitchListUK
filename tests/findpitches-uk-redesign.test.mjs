import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../src/uk/index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/uk/home.css', import.meta.url), 'utf8');

test('UK redesign is staged and not indexable before launch', () => {
  assert.match(html, /<meta name="robots" content="noindex,nofollow"/);
  assert.doesNotMatch(html, /rel="canonical"/);
});

test('UK redesign uses FindPitches identity, not legacy PitchList branding', () => {
  assert.match(html, /FindPitches/);
  assert.doesNotMatch(html, /PitchList UK/);
  assert.doesNotMatch(html, /home-redesign|home-hero|brand-mark/);
});

test('UK redesign is postcode-first and uses UK trading language', () => {
  assert.match(html, /name="postcode"/);
  assert.match(html, /place to trade/i);
  assert.match(html, /stallholders/i);
  assert.match(html, /Food Pitches/);
});

test('UK redesign is built on the shared country shell', () => {
  assert.match(html, /class="fp-country uk-home" data-country="uk"/);
  assert.match(html, /\/shared\/findpitches-shell\.css/);
  assert.match(css, /--uk-green/);
});
