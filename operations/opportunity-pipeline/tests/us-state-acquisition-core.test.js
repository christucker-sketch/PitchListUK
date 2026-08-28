import test from 'node:test';
import assert from 'node:assert/strict';
import { assertApprovedStateSources, buildStateStagingManifest, createStateAdapter, requireState } from '../lib/us-state-acquisition-core.js';
import { runApprovedStateStaging } from '../lib/us-state-staging-runner.js';

const texas = { code: 'TX', name: 'Texas', slug: 'texas', jurisdiction: 'US-TX' };
const source = { id: 'tx-test', name: 'Test Vendor Market', organiser: 'Test Market Association', locality: 'Austin', recurring: false, event_start: '2026-10-10', event_end: '2026-10-10', source_url: 'https://example.com/event', application_url: 'https://example.com/apply', country_code: 'US', region_code: 'TX', jurisdiction: 'US-TX', status: 'approved-pilot' };

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

test('expired application deadlines are held before fetch and cannot reach promotion', async () => {
  let fetchCount = 0;
  const expired = { ...source, id: 'tx-expired', application_deadline: '2026-08-01' };
  const open = { ...source, id: 'tx-open', source_url: 'https://example.com/open', application_url: 'https://example.com/open/apply', application_deadline: '2026-08-28' };
  const manifest = await runApprovedStateStaging(texas, {
    sources: [expired, open],
    generatedAt: '2026-08-28T12:00:00.000Z',
    runId: 'deadline-gate-test',
    fetchPage: async ({ source: approved }) => {
      fetchCount += 1;
      return {
        url: approved.source_url,
        title: approved.name,
        text: 'Vendor application is open. Apply now for a vendor booth at this market.',
        application_url: approved.application_url
      };
    }
  });

  assert.equal(fetchCount, 1);
  assert.equal(manifest.staged_count, 1);
  assert.equal(manifest.held_count, 1);
  assert.equal(manifest.held[0].reason, 'application_deadline_passed');
  assert.equal(manifest.held[0].application_deadline, '2026-08-01');
  assert.equal(manifest.rows[0].source_id, 'tx-open');
});

test('state adapters require stage promote and plan contracts', () => {
  const adapter = createStateAdapter(texas, { stage() {}, promote() {}, plan() {} });
  assert.equal(adapter.state.code, 'TX');
  assert.throws(() => createStateAdapter(texas, { stage() {}, promote() {} }), /requires plan/);
});
