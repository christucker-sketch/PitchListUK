import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GLOBAL_NAV,
  GLOBAL_CATEGORIES,
  countryPath,
  buildCountryNavigation,
  buildCountrySelector
} from '../platform/web-shell.mjs';

test('shared navigation defines one canonical route model', () => {
  assert.deepEqual(GLOBAL_NAV.map(item => item.key), ['find', 'how', 'categories', 'about']);
  assert.equal(countryPath('us'), '/us/');
  assert.equal(countryPath('uk', 'find-pitches'), '/uk/find-pitches');
  assert.equal(countryPath('ca', '/find-pitches/'), '/ca/find-pitches');
  assert.equal(countryPath('xx', 'find-pitches'), null);
});

test('country navigation localizes links under the country root', () => {
  const us = buildCountryNavigation('us');
  const uk = buildCountryNavigation('uk');
  assert.equal(us.home, '/us/');
  assert.equal(us.items.find(item => item.key === 'find').href, '/us/find-pitches');
  assert.equal(us.items.find(item => item.key === 'categories').href, '/us/#categories');
  assert.equal(uk.items.find(item => item.key === 'find').href, '/uk/find-pitches');
});

test('country selector exposes active countries by default', () => {
  assert.deepEqual(buildCountrySelector().map(item => item.code), ['us', 'uk']);
  assert.deepEqual(buildCountrySelector({ includePlanned: true }).map(item => item.code), ['us', 'uk', 'ca', 'au', 'nz', 'ie']);
});

test('shared categories retain the approved six-category product model', () => {
  assert.deepEqual(GLOBAL_CATEGORIES.map(item => item.key), ['fairs', 'festivals', 'markets', 'food', 'popups', 'concessions']);
  for (const category of GLOBAL_CATEGORIES) assert.match(category.asset, /^\/assets\//);
});
