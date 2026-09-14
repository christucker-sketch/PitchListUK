import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveCaAcquisitionUnit } from '../platform/acquisition/ca-geography.mjs';

const expected = new Map([
  ['Calgary', 'AB'],
  ['Edmonton', 'AB'],
  ['Vancouver', 'BC'],
  ['Winnipeg', 'MB'],
  ['Moncton', 'NB'],
  ['Halifax', 'NS'],
  ['Toronto', 'ON'],
  ['Ottawa', 'ON'],
  ['Montreal', 'QC'],
  ['Montréal', 'QC'],
  ['Saskatoon', 'SK'],
  ['Regina', 'SK'],
  ['Yellowknife', 'NT'],
  ['Whitehorse', 'YT']
]);

test('curated Canadian municipal geography maps deterministically to one province or territory', () => {
  for (const [city, code] of expected) {
    const resolved = resolveCaAcquisitionUnit({ location: city });
    assert.equal(resolved.status, 'mapped', city);
    assert.equal(resolved.unit.code, code, city);
  }
});

test('unlisted city names remain review-only rather than being guessed', () => {
  const resolved = resolveCaAcquisitionUnit({ location: 'Exampleville' });
  assert.equal(resolved.status, 'review');
  assert.equal(resolved.reason, 'unmapped_geography');
});
