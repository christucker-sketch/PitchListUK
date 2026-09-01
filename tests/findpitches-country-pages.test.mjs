import assert from 'node:assert/strict';
import test from 'node:test';
import { getCountryPageModule, listCountryPageModules } from '../platform/country-pages.mjs';

test('US page module is on the shared shell', () => {
  const us = getCountryPageModule('us');
  assert.equal(us.country.code, 'us');
  assert.equal(us.canonicalBase, '/us/');
  assert.equal(us.homepage, 'src/us/index.html');
  assert.equal(us.migrationState, 'shared-shell-live');
  assert.equal(us.navigation.home, '/us/');
});

test('UK page module publishes the shared-shell page while preserving its legacy product host', () => {
  const uk = getCountryPageModule('uk');
  assert.equal(uk.country.code, 'uk');
  assert.equal(uk.legacyHost, 'pitchlist.uk');
  assert.equal(uk.canonicalBase, '/uk/');
  assert.equal(uk.homepage, 'src/uk/index.html');
  assert.equal(uk.searchPage, null);
  assert.equal(uk.migrationState, 'shared-shell-live');
  assert.equal(uk.navigation.home, '/uk/');
  assert.equal(uk.navigation.items[0].href, '/uk/find-pitches');
});

test('only implemented country page modules are listed', () => {
  assert.deepEqual(listCountryPageModules().map(module => module.code), ['us', 'uk']);
  assert.equal(getCountryPageModule('ca'), null);
});
