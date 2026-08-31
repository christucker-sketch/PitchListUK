import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countryRegistry,
  getCountry,
  isSupportedCountry,
  listActiveCountries,
  listCountries
} from '../platform/countries.mjs';

test('country registry exposes unique canonical country paths', () => {
  const paths = Object.values(countryRegistry).map(country => country.canonicalPath);
  assert.equal(new Set(paths).size, paths.length);
  for (const [code, country] of Object.entries(countryRegistry)) {
    assert.equal(country.code, code);
    assert.match(country.canonicalPath, new RegExp(`^/${code}/$`));
  }
});

test('US and UK are active while next English-speaking markets are planned', () => {
  assert.deepEqual(listActiveCountries().map(country => country.code).sort(), ['uk', 'us']);
  assert.deepEqual(
    listCountries({ status: 'planned' }).map(country => country.code).sort(),
    ['au', 'ca', 'ie', 'nz']
  );
});

test('country-specific locale and geography semantics remain explicit', () => {
  const us = getCountry('US');
  const uk = getCountry(' uk ');
  const ca = getCountry('ca');

  assert.equal(us.locale, 'en-US');
  assert.equal(us.currency, 'USD');
  assert.equal(us.postal.label, 'ZIP Code');
  assert.equal(us.region.plural, 'states');

  assert.equal(uk.locale, 'en-GB');
  assert.equal(uk.currency, 'GBP');
  assert.equal(uk.postal.label, 'Postcode');
  assert.equal(uk.dateFormat, 'DD/MM/YYYY');

  assert.equal(ca.currency, 'CAD');
  assert.equal(ca.postal.label, 'Postal Code');
});

test('registry lookup fails closed for unknown markets', () => {
  assert.equal(getCountry(''), null);
  assert.equal(getCountry('fr'), null);
  assert.equal(isSupportedCountry('au'), true);
  assert.equal(isSupportedCountry('fr'), false);
});

test('country definitions include acquisition and search vocabulary', () => {
  for (const country of Object.values(countryRegistry)) {
    assert.ok(country.acquisitionTerms.length > 0, `${country.code} must declare acquisition vocabulary`);
    assert.ok(country.searchTerms.length > 0, `${country.code} must declare search vocabulary`);
  }
});
