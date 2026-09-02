import test from 'node:test';
import assert from 'node:assert/strict';
import { CALIFORNIA_SOURCES } from '../config/california-source-registry.js';
import { runApprovedStateStaging } from '../lib/us-state-staging-runner.js';
import publicationCore from '../lib/us-state-publication-core.js';
import { getStateConfig } from '../../cloudflare-texas-acquisition/src/us-state-registry.js';

const california = { code: 'CA', name: 'California', slug: 'california', jurisdiction: 'US-CA' };
const { buildStatePromotionManifest, planStateProductionSnapshot } = publicationCore;

test('California launches with a substantial reviewed source pack and unique routes', () => {
  assert.ok(CALIFORNIA_SOURCES.length >= 20);
  assert.equal(new Set(CALIFORNIA_SOURCES.map(source => source.id)).size, CALIFORNIA_SOURCES.length);
  assert.equal(new Set(CALIFORNIA_SOURCES.map(source => source.source_url)).size, CALIFORNIA_SOURCES.length);
  assert.ok(CALIFORNIA_SOURCES.every(source => source.country_code === 'US'));
  assert.ok(CALIFORNIA_SOURCES.every(source => source.region_code === 'CA'));
  assert.ok(CALIFORNIA_SOURCES.every(source => source.jurisdiction === 'US-CA'));
  assert.ok(CALIFORNIA_SOURCES.every(source => source.status === 'approved-pilot'));
});

test('Cloudflare state registry exposes California independently from Texas and Florida', () => {
  const state = getStateConfig('CA');
  assert.equal(state.code, 'CA');
  assert.equal(state.jurisdiction, 'US-CA');
  assert.equal(state.sources.length, CALIFORNIA_SOURCES.length);
});

test('generic California staging, promotion and apply remain addition-only and state-scoped', async () => {
  const sources = CALIFORNIA_SOURCES.slice(0, 2);
  const staging = await runApprovedStateStaging(california, {
    sources,
    runId: 'test-california-launch',
    generatedAt: '2026-08-28T00:00:00.000Z',
    fetchPage: async ({ source }) => ({
      url: source.source_url,
      title: source.name,
      text: 'Vendor application is open. Apply now for a vendor booth at this market or festival.',
      application_url: source.application_url
    })
  });

  assert.equal(staging.region_code, 'CA');
  assert.equal(staging.jurisdiction, 'US-CA');
  assert.equal(staging.staged_count, 2);
  assert.equal(staging.held_count, 0);
  assert.ok(staging.rows.every(row => row.publishable === false && row.quality_status === 'review'));

  const promotion = buildStatePromotionManifest(california, staging, { sources });
  assert.equal(promotion.region_code, 'CA');
  assert.equal(promotion.jurisdiction, 'US-CA');
  assert.equal(promotion.expected_additions, 2);
  assert.ok(promotion.rows.every(row => row.publishable === true && row.quality_status === 'customer_ready'));

  const planned = planStateProductionSnapshot(california, { total: 0, rows: [] }, promotion, staging, { sources });
  assert.equal(planned.summary.additions, 2);
  assert.equal(planned.summary.after_count, 2);
  assert.ok(planned.preview.rows.every(row => row.region_code === 'CA'));
  assert.equal(planned.summary.production_write_authorized, false);
});

test('California publication treats srsltid variants of an existing production identity as already present', () => {
  const source = {
    id: 'ca-ocean-beach-regression',
    name: 'Farmers Market Vendor Application | Ocean Beach San Diego CA',
    organiser: 'Farmers Market',
    source_url: 'https://oceanbeachsandiego.com/attractions/annual-events/farmers-market-wednesdays/vendor-application?srsltid=NEWTRACKING',
    application_url: 'https://oceanbeachsandiego.com/attractions/annual-events/farmers-market-wednesdays/vendor-application?srsltid=NEWTRACKING',
    source_class: 'government-organisation',
    country_code: 'US',
    jurisdiction: 'US-CA',
    region_code: 'CA',
    locality: 'San Diego',
    status: 'approved-pilot'
  };

  const staging = {
    run_id: 'california-ocean-beach-regression',
    generated_at: '2026-09-02T00:00:00.000Z',
    country_code: 'US',
    region_code: 'CA',
    jurisdiction: 'US-CA',
    mode: 'addition-only',
    staging_only: true,
    automatic_publish: false,
    production_writes: false,
    held: [],
    rows: [{
      stable_id: 'opp_us_0264def229f623f73379',
      event_name: 'Farmers Market Vendor Application | Ocean Beach San Diego CA',
      organiser: 'Farmers Market',
      source_url: source.source_url,
      application_url: source.application_url,
      location: 'San Diego',
      locality: 'San Diego',
      region: 'California',
      region_code: 'CA',
      region_name: 'California',
      country: 'United States',
      country_code: 'US',
      jurisdiction: 'US-CA',
      event_start: '2027-06-26',
      quality_status: 'review',
      publishable: false
    }]
  };

  const existing = {
    stable_id: 'opp_us_0264def229f623f73379',
    id: 'opp_us_0264def229f623f73379',
    event_name: 'Farmers Market Vendor Application | Ocean Beach San Diego CA',
    organiser: 'Farmers Market',
    source_url: 'https://oceanbeachsandiego.com/attractions/annual-events/farmers-market-wednesdays/vendor-application?srsltid=OLDTRACKING',
    application_url: 'https://oceanbeachsandiego.com/attractions/annual-events/farmers-market-wednesdays/vendor-application?srsltid=OLDTRACKING',
    location: 'San Diego',
    locality: 'San Diego',
    region: 'California',
    region_code: 'CA',
    region_name: 'California',
    country: 'United States',
    country_code: 'US',
    jurisdiction: 'US-CA',
    quality_status: 'customer_ready',
    publishable: true
  };

  const promotion = buildStatePromotionManifest(california, staging, { sources: [source] });

  const planned = planStateProductionSnapshot(
    california,
    { total: 1, rows: [existing] },
    promotion,
    staging,
    { sources: [source] }
  );

  assert.equal(planned.summary.before_count, 1);
  assert.equal(planned.summary.after_count, 1);
  assert.equal(planned.summary.already_present, 1);
  assert.equal(planned.summary.additions, 0);
  assert.deepEqual(planned.summary.existing_ids, ['opp_us_0264def229f623f73379']);
});
