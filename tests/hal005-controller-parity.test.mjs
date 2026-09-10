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

for (const state of [
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
  baseState({ deferred_units: [{ disposition: 'genuine_blocker', mode: 'discover', state_code: 'MA' }] }),
  baseState({ status: 'ready_acquisition', current: { state_code: 'NY' }, pending_source_ids: ['source-1'], acquisition_batch: 2 })
]) {
  test(`authoritative and Cloudflare shadow decisions match for ${state.status}`, () => {
    assert.deepEqual(authoritativeControllerDecision(state), shadowControllerDecision(state));
  });
}
