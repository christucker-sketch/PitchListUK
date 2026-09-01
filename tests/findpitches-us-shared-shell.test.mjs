import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const homeUrl = new URL('../src/us/index.html', import.meta.url);
const heroCssUrl = new URL('../src/us/hero.css', import.meta.url);
const heroAssetUrl = new URL('../src/assets/findpitches-us-hero.png', import.meta.url);
const shellCssUrl = new URL('../src/shared/findpitches-shell.css', import.meta.url);

test('US homepage opts into the shared FindPitches shell contract', async () => {
  const home = await readFile(homeUrl, 'utf8');
  assert.match(home, /class="fp-country fp-country-us us-home" data-country="us"/);
  assert.match(home, /\/shared\/findpitches-shell\.css/);
  assert.match(home, /class="fp-header us-topbar"/);
  assert.match(home, /class="fp-brand us-logo"/);
  assert.match(home, /class="fp-nav us-nav"/);
  assert.match(home, /class="fp-category-grid us-category-cards"/);
  assert.match(home, /class="fp-footer us-footer"/);
});

test('US hero uses the single approved image without the stitched scene treatment', async () => {
  const [home, css, asset] = await Promise.all([
    readFile(homeUrl, 'utf8'),
    readFile(heroCssUrl, 'utf8'),
    readFile(heroAssetUrl)
  ]);
  assert.match(home, /https:\/\/findpitches\.com\/assets\/findpitches-us-hero\.png/);
  assert.match(css, /url\(['"]?\/assets\/findpitches-us-hero\.png['"]?\)/);
  assert.match(css, /background-size:\s*cover|\/cover/);
  assert.doesNotMatch(home, /us-hero-flag|us-hero-scene|us-scene-/);
  assert.doesNotMatch(css, /card-shows-festivals\.jpg|card-festival-vendors\.jpg|card-food-truck-pitches\.jpg/);
  assert.deepEqual([...asset.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(asset.readUInt32BE(16), 1717);
  assert.equal(asset.readUInt32BE(20), 916);
});

test('shared shell exposes country-neutral design tokens', async () => {
  const css = await readFile(shellCssUrl, 'utf8');
  for (const token of ['--fp-navy', '--fp-red', '--fp-cream', '--fp-content-max', '--fp-page-gutter']) {
    assert.match(css, new RegExp(token));
  }
  assert.match(css, /\.fp-country\[data-country="us"\]/);
  assert.match(css, /\.fp-country\[data-country="uk"\]/);
});

test('US trust copy describes automated evidence gates accurately', async () => {
  const home = await readFile(homeUrl, 'utf8');
  assert.match(home, /Evidence Checked/);
  assert.match(home, /Quality gates verify source evidence/);
  assert.doesNotMatch(home, /Human Checked/);
  assert.match(home, /BUILT FOR AMERICA/);
  assert.doesNotMatch(home, /BUILT IN THE USA/);
});
