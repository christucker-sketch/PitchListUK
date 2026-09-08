import assert from 'node:assert/strict';
import test from 'node:test';

import {
  acquisitionDiscoveryProfile,
  buildGlobalAcquisitionUnit,
  getGlobalAcquisitionMarket,
  globalAcquisitionMarkets,
  globalAcquisitionServiceIdentity,
  parseAcquisitionSnapshotModule,
  serializeAcquisitionSnapshotModule
} from '../platform/acquisition/global-engine.mjs';

test('global engine exposes only deliberately enabled operational markets by default', () => {
  assert.deepEqual(globalAcquisitionMarkets({ enabled: true }).map(market => market.country).sort(), ['UK', 'US']);
  assert.equal(getGlobalAcquisitionMarket('US').currency, 'USD');
  assert.equal(getGlobalAcquisitionMarket('UK').currency, 'GBP');
  assert.throws(() => getGlobalAcquisitionMarket('CA'), /planned but not enabled/);
});

test('live US and UK units are built through the same engine contract', () => {
  const texas = buildGlobalAcquisitionUnit('US', {
    code: 'TX',
    name: 'Texas',
    slug: 'texas',
    jurisdiction: 'US-TX',
    schedule_order: 10,
    sources: [{ id: 'tx-one' }]
  });
  const kent = buildGlobalAcquisitionUnit('UK', {
    code: 'GB-ENG-KENT',
    name: 'Kent',
    schedule_order: 210,
    sources: [{ id: 'uk-one' }]
  });

  assert.equal(texas.snapshot_path, 'functions/_data/us-opportunities.mjs');
  assert.equal(texas.snapshot_export, 'usOpportunitySnapshot');
  assert.equal(texas.geography_kind, 'state');
  assert.equal(texas.sources.length, 1);
  assert.equal(kent.snapshot_path, 'functions/_data/opportunities.mjs');
  assert.equal(kent.snapshot_export, 'opportunitySnapshot');
  assert.equal(kent.geography_kind, 'acquisition_area');
  assert.equal(kent.jurisdiction, 'GB-ENG-KENT');
});

test('future markets are modelable but fail closed for live execution', () => {
  const ontario = buildGlobalAcquisitionUnit('CA', {
    code: 'ON',
    name: 'Ontario',
    schedule_order: 10
  }, { require_enabled: false });
  assert.equal(ontario.country, 'CA');
  assert.equal(ontario.currency, 'CAD');
  assert.equal(ontario.snapshot_path, 'functions/_data/ca-opportunities.mjs');
  assert.throws(() => buildGlobalAcquisitionUnit('CA', { code: 'ON', name: 'Ontario' }), /planned but not enabled/);
});

test('snapshot parsing and serialization are country-aware rather than US-hard-coded', () => {
  const us = parseAcquisitionSnapshotModule('export const usOpportunitySnapshot = {"total":1,"rows":[]};\n', 'US');
  const uk = parseAcquisitionSnapshotModule('export const opportunitySnapshot = {"total":2,"rows":[]};\n', 'UK');
  assert.equal(us.total, 1);
  assert.equal(uk.total, 2);
  assert.match(serializeAcquisitionSnapshotModule({ total: 3, rows: [] }, 'US'), /^export const usOpportunitySnapshot = /);
  assert.match(serializeAcquisitionSnapshotModule({ total: 4, rows: [] }, 'UK'), /^export const opportunitySnapshot = /);
});

test('discovery vocabulary comes from the same global market definition', () => {
  const us = acquisitionDiscoveryProfile('US');
  const uk = acquisitionDiscoveryProfile('UK');
  assert.ok(us.acquisition_terms.includes('vendor'));
  assert.ok(uk.acquisition_terms.includes('stallholder'));
  assert.equal(globalAcquisitionServiceIdentity(), 'FindPitches-Global-Acquisition/1.0');
});
