import test from 'node:test';
import assert from 'node:assert/strict';

import { createFindPitchesPublisher } from '../../platform/findpitches-v2/publisher/index.mjs';
import { reconcilePublicationResult } from '../../platform/findpitches-v2/publisher/reconcile.mjs';

test('review can safely reduce a five-row plan to three published rows', () => {
  const plan = {
    market: 'GB',
    candidate_count: 5,
    candidate_ids: ['a', 'b', 'c', 'd', 'e']
  };

  const result = reconcilePublicationResult(plan, {
    publishedIds: ['a', 'b', 'c'],
    rejectedIds: ['d'],
    heldIds: ['e']
  });

  assert.equal(result.planned_count, 5);
  assert.equal(result.published_count, 3);
  assert.equal(result.rejected_count, 1);
  assert.equal(result.held_count, 1);
  assert.equal(result.remaining_count, 0);
  assert.equal(result.safe_reduction, true);
});

test('unreviewed rows remain validated instead of wedging the batch', () => {
  const plan = {
    market: 'US',
    candidate_count: 5,
    candidate_ids: ['a', 'b', 'c', 'd', 'e']
  };

  const result = reconcilePublicationResult(plan, {
    publishedIds: ['a', 'b', 'c']
  });

  assert.deepEqual(result.remaining_ids, ['d', 'e']);
  assert.equal(result.remaining_count, 2);
});

test('review cannot introduce ids outside the plan', () => {
  const plan = {
    market: 'CA',
    candidate_count: 1,
    candidate_ids: ['a']
  };

  assert.throws(
    () => reconcilePublicationResult(plan, { publishedIds: ['other'] }),
    /findpitches_v2_reconcile_published_outside_plan/
  );
});

test('review categories cannot overlap', () => {
  const plan = {
    market: 'GB',
    candidate_count: 1,
    candidate_ids: ['a']
  };

  assert.throws(
    () => reconcilePublicationResult(plan, {
      publishedIds: ['a'],
      rejectedIds: ['a']
    }),
    /findpitches_v2_reconcile_overlap/
  );
});

test('publisher stays dry-run when publication is disabled', async () => {
  const publisher = createFindPitchesPublisher({ enabled: false });
  const reconciliation = {
    published_ids: ['a'],
    rejected_ids: [],
    held_ids: [],
    remaining_ids: []
  };

  const result = await publisher.apply({}, reconciliation);

  assert.equal(publisher.enabled, false);
  assert.equal(result.applied, false);
  assert.equal(result.reason, 'publication_disabled');
});
