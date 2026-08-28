import test from 'node:test';
import assert from 'node:assert/strict';
import { NEW_YORK_SOURCES } from '../config/new-york-source-registry.js';
import { runApprovedStateStaging } from '../lib/us-state-staging-runner.js';
import publicationCore from '../lib/us-state-publication-core.js';
import { getStateConfig } from '../../cloudflare-texas-acquisition/src/us-state-registry.js';

const newYork = { code: 'NY', name: 'New York', slug: 'new-york', jurisdiction: 'US-NY' };
const { buildStatePromotionManifest, planStateProductionSnapshot } = publicationCore;

test('New York launches with a reviewed source pack and unique routes', () => {
  assert.ok(NEW_YORK_SOURCES.length >= 12);
  assert.equal(new Set(NEW_YORK_SOURCES.map(source => source.id)).size, NEW_YORK_SOURCES.length);
  assert.equal(new Set(NEW_YORK_SOURCES.map(source => source.source_url)).size, NEW_YORK_SOURCES.length);
  assert.ok(NEW_YORK_SOURCES.every(source => source.country_code === 'US'));
  assert.ok(NEW_YORK_SOURCES.every(source => source.region_code === 'NY'));
  assert.ok(NEW_YORK_SOURCES.every(source => source.jurisdiction === 'US-NY'));
  assert.ok(NEW_YORK_SOURCES.every(source => source.status === 'approved-pilot'));
});

test('Cloudflare state registry exposes New York independently from existing states', () => {
  const state = getStateConfig('NY');
  assert.equal(state.code, 'NY');
  assert.equal(state.name, 'New York');
  assert.equal(state.jurisdiction, 'US-NY');
  assert.equal(state.sources.length, NEW_YORK_SOURCES.length);
});

test('generic New York staging promotion and apply remain addition-only and state-scoped', async () => {
  const sources = NEW_YORK_SOURCES.slice(0, 2).map((source, index) => ({
    ...source,
    source_url: `https://example.com/new-york-${index + 1}`,
    application_url: `https://example.com/new-york-${index + 1}/apply`,
    application_deadline: ''
  }));
  const staging = await runApprovedStateStaging(newYork, {
    sources,
    runId: 'test-new-york-launch',
    generatedAt: '2026-08-28T00:00:00.000Z',
    fetchPage: async ({ source }) => ({
      url: source.source_url,
      title: source.name,
      text: 'Vendor application is open. Apply now for a vendor booth at this market or festival.',
      application_url: source.application_url
    })
  });

  assert.equal(staging.region_code, 'NY');
  assert.equal(staging.jurisdiction, 'US-NY');
  assert.equal(staging.staged_count, 2);
  assert.equal(staging.held_count, 0);
  assert.ok(staging.rows.every(row => row.publishable === false && row.quality_status === 'review'));

  const promotion = buildStatePromotionManifest(newYork, staging, { sources });
  assert.equal(promotion.region_code, 'NY');
  assert.equal(promotion.jurisdiction, 'US-NY');
  assert.equal(promotion.expected_additions, 2);
  assert.ok(promotion.rows.every(row => row.publishable === true && row.quality_status === 'customer_ready'));

  const existingTexas = { stable_id: 'existing-tx', id: 'existing-tx', event_name: 'Existing Texas Row', organiser: 'Texas', source_url: 'https://example.com/tx', application_url: 'https://example.com/tx/apply', country_code: 'US', region_code: 'TX', jurisdiction: 'US-TX', quality_status: 'customer_ready', publishable: true };
  const planned = planStateProductionSnapshot(newYork, { total: 1, rows: [existingTexas] }, promotion, staging, { sources });
  assert.equal(planned.summary.additions, 2);
  assert.equal(planned.summary.after_count, 3);
  assert.deepEqual(planned.preview.rows[0], existingTexas);
  assert.ok(planned.preview.rows.slice(1).every(row => row.region_code === 'NY'));
  assert.equal(planned.summary.production_write_authorized, false);
});
