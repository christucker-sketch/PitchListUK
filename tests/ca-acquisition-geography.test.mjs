import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CA_ACQUISITION_UNITS,
  enabledCaAcquisitionUnits,
  getCaAcquisitionUnit,
  resolveCaAcquisitionUnit
} from '../platform/acquisition/ca-geography.mjs';
import { buildAcquisitionContext } from '../platform/acquisition/country-contract.mjs';
import { parseAcquisitionSnapshotModule } from '../platform/acquisition/global-engine.mjs';
import { readFileSync } from 'node:fs';

const expectedCodes = ['AB','BC','MB','NB','NL','NS','ON','PE','QC','SK','NT','NU','YT'];

test('Canada registry contains all ten provinces and three territories exactly once', () => {
  assert.equal(CA_ACQUISITION_UNITS.length, 13);
  assert.deepEqual(enabledCaAcquisitionUnits().map(unit => unit.code), expectedCodes);
  assert.equal(new Set(CA_ACQUISITION_UNITS.map(unit => unit.code)).size, 13);
  assert.equal(CA_ACQUISITION_UNITS.filter(unit => unit.kind === 'province').length, 10);
  assert.equal(CA_ACQUISITION_UNITS.filter(unit => unit.kind === 'territory').length, 3);
});

test('Canada units project into the shared country contract without enabling acquisition', () => {
  const ontario = getCaAcquisitionUnit('CA-ON');
  const context = buildAcquisitionContext('CA', ontario, { require_enabled: false });
  assert.equal(context.country, 'CA');
  assert.equal(context.currency, 'CAD');
  assert.equal(context.locale, 'en-CA');
  assert.equal(context.unit_code, 'ON');
  assert.equal(context.unit_name, 'Ontario');
  assert.equal(context.jurisdiction, 'CA-ON');
  assert.equal(context.geography_kind, 'province_or_territory');
  assert.throws(() => buildAcquisitionContext('CA', ontario, { require_enabled: true }), /planned but not enabled/);
});

test('Canada geography resolver accepts province codes, ISO jurisdictions, aliases and accented Quebec', () => {
  assert.equal(resolveCaAcquisitionUnit({ province_code: 'BC' }).unit.code, 'BC');
  assert.equal(resolveCaAcquisitionUnit({ region_code: 'CA-ON' }).unit.code, 'ON');
  assert.equal(resolveCaAcquisitionUnit({ province: 'PEI' }).unit.code, 'PE');
  assert.equal(resolveCaAcquisitionUnit({ region: 'Québec' }).unit.code, 'QC');
  assert.equal(resolveCaAcquisitionUnit({ location: 'Vancouver, British Columbia' }).unit.code, 'BC');
});

test('Canada geography resolver fails closed for broad, ambiguous and unmapped geography', () => {
  assert.equal(resolveCaAcquisitionUnit({ region: 'Canada' }).reason, 'broad_geography_requires_review');
  assert.equal(resolveCaAcquisitionUnit({ location: 'Ontario / Quebec' }).reason, 'ambiguous_geography');
  assert.equal(resolveCaAcquisitionUnit({ location: 'Unknown Place' }).reason, 'unmapped_geography');
});

test('Canada shadow snapshot is parseable and empty before deliberate launch', () => {
  const source = readFileSync(new URL('../functions/_data/ca-opportunities.mjs', import.meta.url), 'utf8');
  const snapshot = parseAcquisitionSnapshotModule(source, 'CA');
  assert.equal(snapshot.total, 0);
  assert.deepEqual(snapshot.rows, []);
  assert.equal(snapshot.source, 'canada-shadow-bootstrap');
});
