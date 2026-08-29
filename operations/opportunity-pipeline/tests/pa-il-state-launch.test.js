import test from 'node:test';
import assert from 'node:assert/strict';
import { PENNSYLVANIA_SOURCES } from '../config/pennsylvania-source-registry.js';
import { ILLINOIS_SOURCES } from '../config/illinois-source-registry.js';
import { runApprovedStateStaging } from '../lib/us-state-staging-runner.js';
import publicationCore from '../lib/us-state-publication-core.js';
import { getStateConfig } from '../../cloudflare-texas-acquisition/src/us-state-registry.js';

const { buildStatePromotionManifest, planStateProductionSnapshot } = publicationCore;

async function assertStateLaunch(state, sources) {
  assert.ok(sources.length >= 8);
  assert.equal(new Set(sources.map(source => source.id)).size, sources.length);
  assert.equal(new Set(sources.map(source => source.source_url)).size, sources.length);
  assert.ok(sources.every(source => source.country_code === 'US'));
  assert.ok(sources.every(source => source.region_code === state.code));
  assert.ok(sources.every(source => source.jurisdiction === state.jurisdiction));
  assert.ok(sources.every(source => source.status === 'approved-pilot'));

  const config = getStateConfig(state.code);
  assert.equal(config.name, state.name);
  assert.equal(config.jurisdiction, state.jurisdiction);
  assert.equal(config.sources.length, sources.length);

  const stagingSources = sources.slice(0, 2).map((source, index) => ({
    ...source,
    source_url: `https://example.com/${state.slug}-${index + 1}`,
    application_url: `https://example.com/${state.slug}-${index + 1}/apply`,
    application_deadline: ''
  }));

  const staging = await runApprovedStateStaging(state, {
    sources: stagingSources,
    runId: `test-${state.slug}-launch`,
    generatedAt: '2026-08-29T00:00:00.000Z',
    fetchPage: async ({ source }) => ({
      url: source.source_url,
      title: source.name,
      text: 'Vendor application is open. Apply now for a vendor booth at this market or festival.',
      application_url: source.application_url
    })
  });

  assert.equal(staging.region_code, state.code);
  assert.equal(staging.jurisdiction, state.jurisdiction);
  assert.equal(staging.staged_count, 2);
  assert.equal(staging.held_count, 0);
  assert.ok(staging.rows.every(row => row.publishable === false && row.quality_status === 'review'));

  const promotion = buildStatePromotionManifest(state, staging, { sources: stagingSources });
  assert.equal(promotion.expected_additions, 2);
  assert.ok(promotion.rows.every(row => row.publishable === true && row.quality_status === 'customer_ready'));

  const existingOtherState = { stable_id: 'existing-tx', id: 'existing-tx', event_name: 'Existing Texas Row', organiser: 'Texas', source_url: 'https://example.com/tx', application_url: 'https://example.com/tx/apply', country_code: 'US', region_code: 'TX', jurisdiction: 'US-TX', quality_status: 'customer_ready', publishable: true };
  const planned = planStateProductionSnapshot(state, { total: 1, rows: [existingOtherState] }, promotion, staging, { sources: stagingSources });
  assert.equal(planned.summary.additions, 2);
  assert.equal(planned.summary.after_count, 3);
  assert.deepEqual(planned.preview.rows[0], existingOtherState);
  assert.ok(planned.preview.rows.slice(1).every(row => row.region_code === state.code));
  assert.equal(planned.summary.production_write_authorized, false);
}

test('Pennsylvania launches through the shared addition-only state engine', async () => {
  await assertStateLaunch({ code: 'PA', name: 'Pennsylvania', slug: 'pennsylvania', jurisdiction: 'US-PA' }, PENNSYLVANIA_SOURCES);
});

test('Illinois launches through the shared addition-only state engine', async () => {
  await assertStateLaunch({ code: 'IL', name: 'Illinois', slug: 'illinois', jurisdiction: 'US-IL' }, ILLINOIS_SOURCES);
});
