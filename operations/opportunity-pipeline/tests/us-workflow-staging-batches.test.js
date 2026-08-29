import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_FETCH_SUBREQUESTS_PER_BATCH,
  mergeStagingBatches,
  stagingSourceBatches
} from '../../cloudflare-texas-acquisition/src/staging-batches.js';

const state = { code: 'TX', name: 'Texas', slug: 'texas', jurisdiction: 'US-TX' };

function manifest(rows, overrides = {}) {
  return {
    generated_at: '2026-08-29T19:00:00.000Z',
    country_code: 'US', region_code: 'TX', jurisdiction: 'US-TX', mode: 'addition-only',
    staging_only: true, automatic_publish: false, production_writes: false,
    source_count: rows.length, discovered_count: rows.length,
    staged_count: rows.length, rejected_count: 0, held_count: 0, duplicate_count: 0,
    rows, rejected: [], held: [], duplicates: [], ...overrides
  };
}

test('Workflow source batches stay below the free-plan subrequest ceiling', () => {
  const sources = Array.from({ length: 51 }, (_, index) => ({
    id: `source-${index}`,
    source_url: `https://example.com/${index}`,
    application_url: index % 4 === 0 ? `https://apply.example.com/${index}` : `https://example.com/${index}`
  }));
  const batches = stagingSourceBatches(sources);
  assert.equal(MAX_FETCH_SUBREQUESTS_PER_BATCH, 36);
  assert.equal(batches.length, 6);
  assert.ok(batches.every(batch => batch.reduce((total, source) => (
    total + (source.source_url === source.application_url ? 3 : 6)
  ), 0) <= MAX_FETCH_SUBREQUESTS_PER_BATCH));
  assert.deepEqual(batches.flat().map(source => source.id), Array.from({ length: 51 }, (_, index) => `source-${index}`));
});

test('source batching reserves all retry and fallback subrequests and rejects bad routes', () => {
  const fallbackSources = Array.from({ length: 13 }, (_, index) => ({
    source_url: `https://source.example/${index}`,
    application_url: `https://application.example/${index}`
  }));
  const batches = stagingSourceBatches(fallbackSources);
  assert.deepEqual(batches.map(batch => batch.length), [6, 6, 1]);
  assert.throws(() => stagingSourceBatches([{ source_url: 'bad', application_url: 'https://example.com' }]), /URLs are required/);
});

test('batch merge preserves controls, counts and cross-batch deduplication', () => {
  const first = { stable_id: 'one', source_url: 'https://example.com/one', application_url: 'https://example.com/app' };
  const duplicate = { stable_id: 'two', source_url: 'https://example.com/two', application_url: 'https://example.com/app/' };
  const unique = { stable_id: 'three', source_url: 'https://example.com/three', application_url: 'https://example.com/three' };
  const merged = mergeStagingBatches(state, [
    manifest([first], { held_count: 1, held: [{ reason: 'fetch_failed' }] }),
    manifest([duplicate, unique], { rejected_count: 1, rejected: [{ reasons: ['closed'] }] })
  ]);

  assert.equal(merged.source_count, 3);
  assert.equal(merged.discovered_count, 3);
  assert.deepEqual(merged.rows, [first, unique]);
  assert.equal(merged.staged_count, 2);
  assert.equal(merged.held_count, 1);
  assert.equal(merged.rejected_count, 1);
  assert.equal(merged.duplicate_count, 1);
  assert.equal(merged.duplicates[0].reason, 'cross_batch_duplicate');
  assert.equal(merged.staging_only, true);
  assert.equal(merged.production_writes, false);
});

test('batch merge fails closed on state or publication-control drift', () => {
  const row = { stable_id: 'one', source_url: 'https://example.com/one', application_url: 'https://example.com/one' };
  assert.throws(() => mergeStagingBatches(state, [manifest([row], { region_code: 'CA' })]), /escaped controlled state boundaries/);
  assert.throws(() => mergeStagingBatches(state, [manifest([row], { production_writes: true })]), /escaped controlled state boundaries/);
  assert.throws(() => mergeStagingBatches(state, [manifest([row], { jurisdiction: 'US-CA' })]), /escaped US-TX/);
});
