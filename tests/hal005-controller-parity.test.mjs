import test from 'node:test';
import assert from 'node:assert/strict';

import { authoritativeControllerDecision } from '../operations/cloudflare-texas-acquisition/scripts/controller-decision-from-state.mjs';
import { shadowControllerDecision } from '../operations/cloudflare-global-acquisition/lib/controller-shadow-decision.mjs';

function baseState(overrides = {}) {
  return {
    status: 'ready',
    snapshot_count: 704,
    target_count: 1200,
    priority_order: ['MA', 'CA'],
    priority_cursor: 0,
    query_offsets: { MA: 108, CA: 144 },
    active_instance: null,
    current: null,
    pending_source_ids: [],
    acquisition_batch: 1,
    deferred_units: [],
    deferred_replay_inflight: null,
    ...overrides
  };
}

const parityStates = [
  baseState(),
  baseState({
    status: 'running_cloudflare_discovery',
    active_instance: { id: 'cf_test', mode: 'discover', state_code: 'MA' }
  }),
  baseState({ status: 'reviewing_source_pr', current: { source_pr: 12, state_code: 'NY' } }),
  baseState({ status: 'reviewing_data_pr', current: { data_pr: 13, state_code: 'NY' } }),
  baseState({ status: 'deploying_production', current: { state_code: 'NY', pending_deploy: { sha: 'abc' } } }),
  baseState({ status: 'waiting_for_live_consistency', current: { state_code: 'NY', pending_deploy: { count: 705 }, live_consistency: { deployment_id: 'dep' } } }),
  baseState({
    status: 'complete',
    snapshot_count: 1200,
    deferred_units: [{ disposition: 'deferred_for_replay', mode: 'discover', state_code: 'IL', query_offset: 68, query_limit: 4, batch_number: 1, replay_attempts: 0 }]
  }),
  baseState({ status: 'blocked_deferred', deferred_units: [{ disposition: 'genuine_blocker', mode: 'discover', state_code: 'MA' }] }),
  baseState({ status: 'ready_acquisition', current: { state_code: 'NY' }, pending_source_ids: ['source-1'], acquisition_batch: 2 }),
  baseState({ status: 'sweep_complete', query_offsets: { MA: 144, CA: 144 } })
];

for (const state of parityStates) {
  test(`authoritative and Cloudflare shadow decisions match for ${state.status}`, () => {
    assert.deepEqual(authoritativeControllerDecision(state), shadowControllerDecision(state));
  });
}

test('genuine deferred blockers do not preempt remaining discovery work', () => {
  const state = baseState({
    priority_order: ['TX'],
    priority_cursor: 0,
    query_offsets: { TX: 20 },
    deferred_units: [
      { disposition: 'genuine_blocker', mode: 'discover', state_code: 'NJ' },
      { disposition: 'genuine_blocker', mode: 'acquire', state_code: 'CA' }
    ]
  });
  const expected = authoritativeControllerDecision(state);
  const shadow = shadowControllerDecision(state);
  assert.equal(expected.action, 'trigger_discovery');
  assert.equal(expected.state_code, 'TX');
  assert.deepEqual(shadow, expected);
});

test('genuine deferred blockers stop only after discovery and replay work are exhausted', () => {
  const state = baseState({
    priority_order: ['MA', 'CA'],
    query_offsets: { MA: 144, CA: 144 },
    deferred_units: [{ disposition: 'genuine_blocker', mode: 'discover', state_code: 'MA' }]
  });
  const expected = { action: 'block', reason: 'deferred_blocker', blocker_count: 1 };
  assert.deepEqual(authoritativeControllerDecision(state), expected);
  assert.deepEqual(shadowControllerDecision(state), expected);
});

test('plan exhaustion with no deferred work marks the sweep complete', () => {
  const state = baseState({
    priority_order: ['MA', 'CA'],
    query_offsets: { MA: 144, CA: 144 }
  });
  const expected = { action: 'mark_sweep_complete' };
  assert.deepEqual(authoritativeControllerDecision(state), expected);
  assert.deepEqual(shadowControllerDecision(state), expected);
});
