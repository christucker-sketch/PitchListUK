import assert from 'node:assert/strict';
import test from 'node:test';

import {
  acquisitionSnapshotPath,
  buildAcquisitionContext,
  compareAcquisitionUnits,
  normalizeAcquisitionCountry
} from '../platform/acquisition/country-contract.mjs';
import { enabledUkAcquisitionAreas } from '../platform/acquisition/uk-geography.mjs';
import { enabledStates } from '../operations/cloudflare-texas-acquisition/src/us-state-registry.js';

test('country contract normalizes supported market aliases and fails closed otherwise', () => {
  assert.equal(normalizeAcquisitionCountry('us'), 'US');
  assert.equal(normalizeAcquisitionCountry('USA'), 'US');
  assert.equal(normalizeAcquisitionCountry('uk'), 'UK');
  assert.equal(normalizeAcquisitionCountry('GB'), 'UK');
  assert.throws(() => normalizeAcquisitionCountry('CA'), /Unsupported acquisition country/);
});

test('US and UK use their existing production snapshots', () => {
  assert.equal(acquisitionSnapshotPath('US'), 'functions/_data/us-opportunities.mjs');
  assert.equal(acquisitionSnapshotPath('UK'), 'functions/_data/opportunities.mjs');
});

test('existing US states project into the shared acquisition context without changing US semantics', () => {
  const texas = enabledStates().find(state => state.code === 'TX');
  const context = buildAcquisitionContext('US', texas);
  assert.deepEqual(context, {
    country: 'US',
    unit_code: 'TX',
    unit_name: 'Texas',
    jurisdiction: 'US-TX',
    schedule_order: 10,
    snapshot_path: 'functions/_data/us-opportunities.mjs',
    geography_kind: 'state'
  });
});

test('UK acquisition areas project into the same contract', () => {
  const kent = enabledUkAcquisitionAreas().find(area => area.code === 'GB-ENG-KENT');
  const context = buildAcquisitionContext('UK', kent);
  assert.equal(context.country, 'UK');
  assert.equal(context.unit_code, 'GB-ENG-KENT');
  assert.equal(context.unit_name, 'Kent');
  assert.equal(context.snapshot_path, 'functions/_data/opportunities.mjs');
  assert.equal(context.geography_kind, 'acquisition_area');
});

test('shared ordering remains deterministic', () => {
  const units = [{ code: 'B', schedule_order: 20 }, { code: 'A', schedule_order: 10 }].sort(compareAcquisitionUnits);
  assert.deepEqual(units.map(unit => unit.code), ['A', 'B']);
});
