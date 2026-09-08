import assert from 'node:assert/strict';
import test from 'node:test';

import {
  acquisitionSnapshotExport,
  acquisitionSnapshotPath,
  assertAcquisitionCountryEnabled,
  buildAcquisitionContext,
  compareAcquisitionUnits,
  isAcquisitionCountryEnabled,
  listAcquisitionCountries,
  normalizeAcquisitionCountry
} from '../platform/acquisition/country-contract.mjs';
import { enabledUkAcquisitionAreas } from '../platform/acquisition/uk-geography.mjs';
import { enabledStates } from '../operations/cloudflare-texas-acquisition/src/us-state-registry.js';

test('country contract normalizes current and planned English-speaking market aliases and fails closed otherwise', () => {
  assert.equal(normalizeAcquisitionCountry('us'), 'US');
  assert.equal(normalizeAcquisitionCountry('USA'), 'US');
  assert.equal(normalizeAcquisitionCountry('uk'), 'UK');
  assert.equal(normalizeAcquisitionCountry('GB'), 'UK');
  assert.equal(normalizeAcquisitionCountry('CAN'), 'CA');
  assert.equal(normalizeAcquisitionCountry('AUS'), 'AU');
  assert.equal(normalizeAcquisitionCountry('NZL'), 'NZ');
  assert.equal(normalizeAcquisitionCountry('IRL'), 'IE');
  assert.throws(() => normalizeAcquisitionCountry('FR'), /Unsupported acquisition country/);
});

test('global acquisition registry exposes US/UK live snapshots and future market snapshot contracts', () => {
  assert.equal(acquisitionSnapshotPath('US'), 'functions/_data/us-opportunities.mjs');
  assert.equal(acquisitionSnapshotExport('US'), 'usOpportunitySnapshot');
  assert.equal(acquisitionSnapshotPath('UK'), 'functions/_data/opportunities.mjs');
  assert.equal(acquisitionSnapshotExport('UK'), 'opportunitySnapshot');
  assert.equal(acquisitionSnapshotPath('CA'), 'functions/_data/ca-opportunities.mjs');
  assert.equal(acquisitionSnapshotPath('AU'), 'functions/_data/au-opportunities.mjs');
  assert.equal(acquisitionSnapshotPath('NZ'), 'functions/_data/nz-opportunities.mjs');
  assert.equal(acquisitionSnapshotPath('IE'), 'functions/_data/ie-opportunities.mjs');
});

test('only US and UK acquisition are enabled until future countries are deliberately launched', () => {
  assert.deepEqual(listAcquisitionCountries({ enabled: true }).map(country => country.country).sort(), ['UK', 'US']);
  assert.deepEqual(listAcquisitionCountries({ enabled: false }).map(country => country.country).sort(), ['AU', 'CA', 'IE', 'NZ']);
  assert.equal(isAcquisitionCountryEnabled('CA'), false);
  assert.throws(() => assertAcquisitionCountryEnabled('CA'), /planned but not enabled/);
});

test('existing US states project into the shared acquisition context without changing US semantics', () => {
  const texas = enabledStates().find(state => state.code === 'TX');
  const context = buildAcquisitionContext('US', texas, { require_enabled: true });
  assert.equal(context.country, 'US');
  assert.equal(context.country_name, 'United States');
  assert.equal(context.currency, 'USD');
  assert.equal(context.locale, 'en-US');
  assert.equal(context.unit_code, 'TX');
  assert.equal(context.unit_name, 'Texas');
  assert.equal(context.jurisdiction, 'US-TX');
  assert.equal(context.schedule_order, 10);
  assert.equal(context.snapshot_path, 'functions/_data/us-opportunities.mjs');
  assert.equal(context.snapshot_export, 'usOpportunitySnapshot');
  assert.equal(context.geography_kind, 'state');
});

test('UK acquisition areas project into the same global contract', () => {
  const kent = enabledUkAcquisitionAreas().find(area => area.code === 'GB-ENG-KENT');
  const context = buildAcquisitionContext('UK', kent, { require_enabled: true });
  assert.equal(context.country, 'UK');
  assert.equal(context.country_name, 'United Kingdom');
  assert.equal(context.currency, 'GBP');
  assert.equal(context.unit_code, 'GB-ENG-KENT');
  assert.equal(context.unit_name, 'Kent');
  assert.equal(context.jurisdiction, 'GB-ENG-KENT');
  assert.equal(context.snapshot_path, 'functions/_data/opportunities.mjs');
  assert.equal(context.snapshot_export, 'opportunitySnapshot');
  assert.equal(context.geography_kind, 'acquisition_area');
});

test('planned markets can be modeled but not operationally enabled by accident', () => {
  const ontario = buildAcquisitionContext('CA', { code: 'ON', name: 'Ontario', schedule_order: 10 });
  assert.equal(ontario.country, 'CA');
  assert.equal(ontario.jurisdiction, 'CA-ON');
  assert.equal(ontario.currency, 'CAD');
  assert.equal(ontario.geography_kind, 'province_or_territory');
  assert.throws(
    () => buildAcquisitionContext('CA', { code: 'ON', name: 'Ontario' }, { require_enabled: true }),
    /planned but not enabled/
  );
});

test('shared ordering remains deterministic', () => {
  const units = [{ code: 'B', schedule_order: 20 }, { code: 'A', schedule_order: 10 }].sort(compareAcquisitionUnits);
  assert.deepEqual(units.map(unit => unit.code), ['A', 'B']);
});
