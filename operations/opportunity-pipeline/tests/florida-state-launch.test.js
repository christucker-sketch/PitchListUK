import test from 'node:test';
import assert from 'node:assert/strict';
import { FLORIDA_SOURCES } from '../config/florida-sources.js';
import { runApprovedStateStaging } from '../lib/us-state-staging-runner.js';
import publicationCore from '../lib/us-state-publication-core.js';
import { getStateConfig } from '../../cloudflare-texas-acquisition/src/us-state-registry.js';

const florida = { code: 'FL', name: 'Florida', slug: 'florida', jurisdiction: 'US-FL' };
const { buildStatePromotionManifest, planStateProductionSnapshot } = publicationCore;

test('Florida launches with a substantial reviewed source pack and unique routes', () => {
  assert.ok(FLORIDA_SOURCES.length >= 20);
  assert.equal(new Set(FLORIDA_SOURCES.map(source => source.id)).size, FLORIDA_SOURCES.length);
  assert.equal(new Set(FLORIDA_SOURCES.map(source => source.source_url)).size, FLORIDA_SOURCES.length);
  assert.ok(FLORIDA_SOURCES.every(source => source.country_code === 'US'));
  assert.ok(FLORIDA_SOURCES.every(source => source.region_code === 'FL'));
  assert.ok(FLORIDA_SOURCES.every(source => source.jurisdiction === 'US-FL'));
  assert.ok(FLORIDA_SOURCES.every(source => source.status === 'approved-pilot'));
});

test('Cloudflare state registry exposes Florida independently from Texas', () => {
  const state = getStateConfig('FL');
  assert.equal(state.code, 'FL');
  assert.equal(state.jurisdiction, 'US-FL');
  assert.equal(state.sources.length, FLORIDA_SOURCES.length);
});

test('generic Florida staging, promotion and apply remain addition-only and state-scoped', async () => {
  const sources = FLORIDA_SOURCES.slice(0, 2);
  const staging = await runApprovedStateStaging(florida, {
    sources,
    runId: 'test-florida-launch',
    generatedAt: '2026-08-28T00:00:00.000Z',
    fetchPage: async ({ source }) => ({
      url: source.source_url,
      title: source.name,
      text: 'Vendor application is open. Apply now for a vendor booth at this market or festival.',
      application_url: source.application_url
    })
  });

  assert.equal(staging.region_code, 'FL');
  assert.equal(staging.jurisdiction, 'US-FL');
  assert.equal(staging.staged_count, 2);
  assert.equal(staging.held_count, 0);
  assert.ok(staging.rows.every(row => row.publishable === false && row.quality_status === 'review'));

  const promotion = buildStatePromotionManifest(florida, staging, { sources });
  assert.equal(promotion.region_code, 'FL');
  assert.equal(promotion.jurisdiction, 'US-FL');
  assert.equal(promotion.expected_additions, 2);
  assert.ok(promotion.rows.every(row => row.publishable === true && row.quality_status === 'customer_ready'));

  const planned = planStateProductionSnapshot(florida, { total: 0, rows: [] }, promotion, staging, { sources });
  assert.equal(planned.summary.additions, 2);
  assert.equal(planned.summary.after_count, 2);
  assert.ok(planned.preview.rows.every(row => row.region_code === 'FL'));
  assert.equal(planned.summary.production_write_authorized, false);
});
