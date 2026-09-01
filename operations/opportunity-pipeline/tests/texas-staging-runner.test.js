import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertApprovedTexasSources,
  buildTexasStagingManifest,
  runApprovedTexasStaging,
} from '../lib/texas-staging-runner.js';
import { mergeStagingBatches } from '../../cloudflare-texas-acquisition/src/staging-batches.js';

const APPROVED_SOURCE = Object.freeze({
  id: 'tx-test-market',
  name: 'Test Texas Market',
  organiser: 'Test City',
  source_url: 'https://example.org/market',
  application_url: 'https://example.org/market/apply',
  country_code: 'US',
  region_code: 'TX',
  jurisdiction: 'US-TX',
  locality: 'Austin',
  recurring: true,
  status: 'approved-pilot',
});

test('approved Texas source guard fails closed outside US-TX or without approval', () => {
  assert.equal(assertApprovedTexasSources([APPROVED_SOURCE]), true);
  assert.throws(() => assertApprovedTexasSources([{ ...APPROVED_SOURCE, country_code: 'GB' }]), /US-TX scoped/);
  assert.throws(() => assertApprovedTexasSources([{ ...APPROVED_SOURCE, status: 'discovered' }]), /explicitly approved/);
});

test('approved Texas staging runner uses the existing acquisition cycle and emits addition-only review rows', async () => {
  const manifest = await runApprovedTexasStaging({
    sources: [APPROVED_SOURCE],
    generatedAt: '2026-08-27T14:30:00Z',
    fetchPage: async ({ url, source }) => {
      assert.equal(url, source.source_url);
      return {
        title: 'Austin Makers Market Vendor Application',
        text: 'Every Saturday. Craft vendor application. Apply to be a vendor.',
      };
    },
  });

  assert.equal(manifest.country_code, 'US');
  assert.equal(manifest.region_code, 'TX');
  assert.equal(manifest.mode, 'addition-only');
  assert.equal(manifest.staging_only, true);
  assert.equal(manifest.automatic_publish, false);
  assert.equal(manifest.production_writes, false);
  assert.equal(manifest.source_count, 1);
  assert.equal(manifest.staged_count, 1);
  assert.equal(manifest.rows.length, 1);
  assert.equal(manifest.rows[0].publishable, false);
  assert.equal(manifest.rows[0].quality_status, 'review');
  assert.equal(manifest.rows[0].country_code, 'US');
  assert.equal(manifest.rows[0].region_code, 'TX');
  assert.equal(manifest.rows[0].source_id, APPROVED_SOURCE.id);
  assert.equal(manifest.evidence_receipts[0].source_id, APPROVED_SOURCE.id);

  const merged = mergeStagingBatches(
    { code: 'TX', name: 'Texas', slug: 'texas', jurisdiction: 'US-TX' },
    [manifest]
  );
  assert.equal(merged.staged_count, 1);
  assert.equal(merged.rows[0].source_id, APPROVED_SOURCE.id);
  assert.equal(merged.evidence_receipts[0].source_id, APPROVED_SOURCE.id);
});

test('procurement content from an approved route is rejected rather than staged', async () => {
  const manifest = await runApprovedTexasStaging({
    sources: [APPROVED_SOURCE],
    fetchPage: async () => ({
      title: 'Vendor Registration',
      text: 'Register as a supplier for procurement opportunities and bids.',
    }),
  });

  assert.equal(manifest.staged_count, 0);
  assert.equal(manifest.rejected_count, 1);
});

test('manifest builder rejects country contamination', () => {
  assert.throws(() => buildTexasStagingManifest({
    staging_rows: [{ country_code: 'GB', jurisdiction: 'GB-ENG', publishable: false }],
  }), /country_code=US/);
});

test('manifest builder forces staging safety flags regardless of input row hints', () => {
  const manifest = buildTexasStagingManifest({
    staging_rows: [{
      stable_id: 'opp_us_test',
      country_code: 'US',
      region_code: 'TX',
      jurisdiction: 'US-TX',
      publishable: true,
      quality_status: 'live',
    }],
  });

  assert.equal(manifest.rows[0].publishable, false);
  assert.equal(manifest.rows[0].quality_status, 'review');
  assert.equal(manifest.automatic_publish, false);
  assert.equal(manifest.production_writes, false);
});
