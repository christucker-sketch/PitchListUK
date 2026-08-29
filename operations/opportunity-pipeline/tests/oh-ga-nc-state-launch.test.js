import test from 'node:test';
import assert from 'node:assert/strict';
import { OHIO_SOURCES } from '../config/ohio-source-registry.js';
import { GEORGIA_SOURCES } from '../config/georgia-source-registry.js';
import { NORTH_CAROLINA_SOURCES } from '../config/north-carolina-source-registry.js';
import { runApprovedStateStaging } from '../lib/us-state-staging-runner.js';
import publicationCore from '../lib/us-state-publication-core.js';
import { getStateConfig } from '../../cloudflare-texas-acquisition/src/us-state-registry.js';

const { buildStatePromotionManifest, planStateProductionSnapshot } = publicationCore;

async function assertStateLaunch(state, sources) {
  assert.ok(sources.length >= 10);
  assert.equal(new Set(sources.map(source => source.id)).size, sources.length);
  assert.equal(new Set(sources.map(source => source.source_url)).size, sources.length);
  assert.ok(sources.every(source => source.country_code === 'US' && source.region_code === state.code && source.jurisdiction === state.jurisdiction));
  assert.ok(sources.every(source => source.status === 'approved-pilot'));

  const config = getStateConfig(state.code);
  assert.equal(config.name, state.name);
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

  assert.equal(staging.staged_count, 2);
  assert.equal(staging.held_count, 0);
  const promotion = buildStatePromotionManifest(state, staging, { sources: stagingSources });
  assert.equal(promotion.expected_additions, 2);

  const existing = { stable_id: 'existing-tx', id: 'existing-tx', event_name: 'Existing Texas Row', organiser: 'Texas', source_url: 'https://example.com/tx', application_url: 'https://example.com/tx/apply', country_code: 'US', region_code: 'TX', jurisdiction: 'US-TX', quality_status: 'customer_ready', publishable: true };
  const planned = planStateProductionSnapshot(state, { total: 1, rows: [existing] }, promotion, staging, { sources: stagingSources });
  assert.equal(planned.summary.additions, 2);
  assert.equal(planned.summary.after_count, 3);
  assert.deepEqual(planned.preview.rows[0], existing);
  assert.ok(planned.preview.rows.slice(1).every(row => row.region_code === state.code));
  assert.equal(planned.summary.production_write_authorized, false);
}

test('Ohio launches through the shared addition-only state engine', async () => {
  await assertStateLaunch({ code: 'OH', name: 'Ohio', slug: 'ohio', jurisdiction: 'US-OH' }, OHIO_SOURCES);
});

test('Georgia launches through the shared addition-only state engine', async () => {
  await assertStateLaunch({ code: 'GA', name: 'Georgia', slug: 'georgia', jurisdiction: 'US-GA' }, GEORGIA_SOURCES);
});

test('North Carolina launches through the shared addition-only state engine', async () => {
  await assertStateLaunch({ code: 'NC', name: 'North Carolina', slug: 'north-carolina', jurisdiction: 'US-NC' }, NORTH_CAROLINA_SOURCES);
});
