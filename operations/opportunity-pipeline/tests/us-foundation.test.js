import test from 'node:test';
import assert from 'node:assert/strict';

import { US_COUNTRY_PROFILE, assertUsCountryProfile } from '../config/us-country-profile.js';
import { US_STATES, getUsState } from '../config/us-states.js';
import { US_SOURCE_REGISTRY, assertUsSourceRegistry } from '../config/us-source-registry.js';
import {
  assertCountryScopedManifest,
  assertCountryScopedRows,
} from '../lib/country-boundary.js';

test('US profile is isolated and Texas-only during foundation stage', () => {
  assert.equal(assertUsCountryProfile(), true);
  assert.equal(US_COUNTRY_PROFILE.countryCode, 'US');
  assert.equal(US_COUNTRY_PROFILE.runtimeNamespace, 'us');
  assert.equal(US_COUNTRY_PROFILE.sourceRegistryNamespace, 'us');
  assert.deepEqual([...US_COUNTRY_PROFILE.enabledStates], ['TX']);
  assert.equal(US_COUNTRY_PROFILE.publication.automaticPublishEnabled, false);
  assert.equal(US_COUNTRY_PROFILE.publication.additionOnly, true);
});

test('US state reference contains all 50 states and resolves Texas', () => {
  assert.equal(US_STATES.length, 50);
  assert.equal(new Set(US_STATES.map(({ code }) => code)).size, 50);
  assert.deepEqual(getUsState('tx'), { code: 'TX', name: 'Texas' });
  assert.equal(getUsState('GB'), null);
});

test('US source registry starts empty and rejects non-US sources', () => {
  assert.equal(US_SOURCE_REGISTRY.length, 0);
  assert.equal(assertUsSourceRegistry(), true);
  assert.throws(
    () => assertUsSourceRegistry([{ country_code: 'GB', jurisdiction: 'GB-ENG' }]),
    /country_code=US/,
  );
});

test('US country boundary accepts only US rows', () => {
  assert.equal(assertCountryScopedRows([
    { country_code: 'US', jurisdiction: 'US-TX' },
    { country_code: 'US', jurisdiction: 'US-CA' },
  ], { countryCode: 'US', jurisdictionPrefix: 'US-' }), true);

  assert.throws(
    () => assertCountryScopedRows([
      { country_code: 'US', jurisdiction: 'US-TX' },
      { country_code: 'GB', jurisdiction: 'GB-ENG' },
    ], { countryCode: 'US', jurisdictionPrefix: 'US-' }),
    /row\[1\].*country_code=US/,
  );
});

test('US manifest guard is fail-closed and addition-only', () => {
  const manifest = {
    country_code: 'US',
    mode: 'addition-only',
    rows: [
      { country_code: 'US', jurisdiction: 'US-TX' },
    ],
  };

  assert.equal(assertCountryScopedManifest(manifest, {
    countryCode: 'US',
    jurisdictionPrefix: 'US-',
    requireAdditionOnly: true,
  }), true);

  assert.throws(
    () => assertCountryScopedManifest({ ...manifest, country_code: 'GB' }, {
      countryCode: 'US',
      jurisdictionPrefix: 'US-',
      requireAdditionOnly: true,
    }),
    /manifest.*country_code=US/,
  );

  assert.throws(
    () => assertCountryScopedManifest({ ...manifest, mode: 'replace' }, {
      countryCode: 'US',
      jurisdictionPrefix: 'US-',
      requireAdditionOnly: true,
    }),
    /addition-only/,
  );
});
