import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countryCodeFromPath,
  countryPublicPath,
  isFindPitchesHost,
  legacyCountryForHost,
  resolveCountryRequest
} from '../platform/routing.mjs';

test('FindPitches hosts are recognized without changing legacy host behavior', () => {
  assert.equal(isFindPitchesHost('findpitches.com'), true);
  assert.equal(isFindPitchesHost('www.findpitches.com'), true);
  assert.equal(isFindPitchesHost('pitchlist.uk'), false);
});

test('legacy domains resolve to their existing country context', () => {
  const us = resolveCountryRequest({ hostname: 'findpitches.com', pathname: '/' });
  const uk = resolveCountryRequest({ hostname: 'pitchlist.uk', pathname: '/' });

  assert.equal(us.country.code, 'us');
  assert.equal(us.source, 'legacy-findpitches-default');
  assert.equal(uk.country.code, 'uk');
  assert.equal(uk.source, 'legacy-host');
  assert.equal(legacyCountryForHost('www.pitchlist.uk').code, 'uk');
});

test('country-prefixed FindPitches paths resolve through the registry in shadow mode', () => {
  assert.equal(countryCodeFromPath('/us/'), 'us');
  assert.equal(countryCodeFromPath('/uk/find-pitches'), 'uk');
  assert.equal(countryCodeFromPath('/ca/'), 'ca');
  assert.equal(countryCodeFromPath('/zz/'), null);

  const uk = resolveCountryRequest({ hostname: 'findpitches.com', pathname: '/uk/find-pitches' });
  assert.equal(uk.country.code, 'uk');
  assert.equal(uk.source, 'path');
});

test('future country paths can be generated without hard-coded URL concatenation', () => {
  assert.equal(countryPublicPath('us'), '/us/');
  assert.equal(countryPublicPath('uk', '/find-pitches'), '/uk/find-pitches');
  assert.equal(countryPublicPath('ca', 'find-pitches'), '/ca/find-pitches');
  assert.equal(countryPublicPath('zz', '/'), null);
});

test('unknown hosts are not claimed by the global resolver', () => {
  assert.equal(resolveCountryRequest({ hostname: 'example.com', pathname: '/us/' }), null);
});
