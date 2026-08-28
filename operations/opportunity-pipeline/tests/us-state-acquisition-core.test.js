import test from 'node:test';
import assert from 'node:assert/strict';
import { assertApprovedStateSources, buildStateStagingManifest, createStateAdapter, requireState } from '../lib/us-state-acquisition-core.js';

const texas = { code: 'TX', name: 'Texas', slug: 'texas', jurisdiction: 'US-TX' };
const source = { id: 'tx-test', source_url: 'https://example.com/event', application_url: 'https://example.com/apply', country_code: 'US', region_code: 'TX', jurisdiction: 'US-TX', status: 'approved-pilot' };

test('generic US state descriptor enforces jurisdiction boundary', () => {
  assert.equal(requireState(texas).jurisdiction, 'US-TX');
  assert.throws(() => requireState({ ...texas, jurisdiction: 'US-FL' }), /Invalid US acquisition state descriptor/);
});

test('approved state sources cannot escape their state boundary', () => {
  assert.equal(assertApprovedStateSources(texas, [source]), true);
  assert.throws(() => assertApprovedStateSources(texas, [{ ...source, region_code: 'FL', jurisdiction: 'US-FL' }]), /escaped US-TX boundary/);
});

test('generic staging manifest remains isolated and staging-only', () => {
  const manifest = buildStateStagingManifest(texas, { discovered_count: 1, staging_rows: [{ country_code: 'US', region_code: 'TX', jurisdiction: 'US-TX', stable_id: 'x' }] }, { sourceCount: 1 });
  assert.equal(manifest.country_code, 'US');
  assert.equal(manifest.region_code, 'TX');
  assert.equal(manifest.jurisdiction, 'US-TX');
  assert.equal(manifest.staging_only, true);
  assert.equal(manifest.automatic_publish, false);
  assert.equal(manifest.production_writes, false);
  assert.equal(manifest.rows[0].publishable, false);
  assert.equal(manifest.rows[0].quality_status, 'review');
});

test('state adapters require stage promote and plan contracts', () => {
  const adapter = createStateAdapter(texas, { stage() {}, promote() {}, plan() {} });
  assert.equal(adapter.state.code, 'TX');
  assert.throws(() => createStateAdapter(texas, { stage() {}, promote() {} }), /requires plan/);
});
