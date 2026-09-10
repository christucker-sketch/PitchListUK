import test from 'node:test';
import assert from 'node:assert/strict';

import { shadowControllerDecision } from '../operations/cloudflare-global-acquisition/lib/controller-shadow-decision.mjs';

function baseState(overrides = {}) {
  return {
    status: 'ready',
    snapshot_count: 704,
    target_count: 1200,
    priority_order: ['MA', 'CA'],
    priority_cursor: 0,
    query_offsets: { MA: 72, CA: 144 },
    active_instance: null,
    current: null,
    pending_source_ids: [],
    acquisition_batch: 1,
    deferred_units: [],
    deferred_replay_inflight: null,
    ...overrides
  };
}

test('ready state selects the next incomplete discovery checkpoint', () => {
  const decision = shadowControllerDecision(baseState());
  assert.equal(decision.action, 'trigger_discovery');
  assert.equal(decision.state_code, 'MA');
  assert.equal(decision.query_offset, 72);
  assert.equal(decision.query_limit, 4);
});

test('active workflow is inspected rather than retriggered', () => {
  const decision = shadowControllerDecision(baseState({
    status: 'running_cloudflare_discovery',
    active_instance: { id: 'cf_test', mode: 'discover', state_code: 'MA' }
  }));
  assert.deepEqual(decision, {
    action: 'inspect_active_workflow',
    status: 'running_cloudflare_discovery',
    mode: 'discover',
    state_code: 'MA',
    instance_id: 'cf_test'
  });
});

test('completed controller with deferred work schedules replay', () => {
  const decision = shadowControllerDecision(baseState({
    status: 'complete',
    snapshot_count: 1200,
    deferred_units: [{
      disposition: 'deferred_for_replay',
      mode: 'discover',
      state_code: 'IL',
      query_offset: 68,
      query_limit: 4,
      batch_number: 1,
      replay_attempts: 0
    }]
  }));
  assert.equal(decision.action, 'schedule_deferred_replay');
  assert.equal(decision.state_code, 'IL');
  assert.equal(decision.query_offset, 68);
});

test('deferred blockers do not preempt remaining discovery work', () => {
  const decision = shadowControllerDecision(baseState({
    deferred_units: [{ disposition: 'genuine_blocker', mode: 'discover', state_code: 'MA' }]
  }));
  assert.equal(decision.action, 'trigger_discovery');
  assert.equal(decision.state_code, 'MA');
});

test('deferred blockers fail closed after discovery and replay are exhausted', () => {
  const decision = shadowControllerDecision(baseState({
    query_offsets: { MA: 144, CA: 144 },
    deferred_units: [{ disposition: 'genuine_blocker', mode: 'discover', state_code: 'MA' }]
  }));
  assert.equal(decision.action, 'block');
  assert.equal(decision.reason, 'deferred_blocker');
});

test('PR and deployment states map to non-mutating shadow actions', () => {
  assert.equal(shadowControllerDecision(baseState({ status: 'reviewing_source_pr', current: { source_pr: 12, state_code: 'NY' } })).action, 'review_source_pr');
  assert.equal(shadowControllerDecision(baseState({ status: 'reviewing_data_pr', current: { data_pr: 13, state_code: 'NY' } })).action, 'review_data_pr');
  assert.equal(shadowControllerDecision(baseState({ status: 'deploying_production', current: { state_code: 'NY', pending_deploy: { sha: 'abc' } } })).action, 'verify_or_deploy_production');
  assert.equal(shadowControllerDecision(baseState({ status: 'waiting_for_live_consistency', current: { state_code: 'NY', pending_deploy: { count: 705 }, live_consistency: { deployment_id: 'dep' } } })).action, 'verify_live_consistency');
});

test('freshly scheduled deferred discovery replay runs its exact query before it may resolve', () => {
  const decision = shadowControllerDecision(baseState({
    status: 'ready',
    priority_order: ['MA', 'CA'],
    priority_cursor: 0,
    query_offsets: { MA: 72, CA: 144 },
    deferred_replay_inflight: {
      key: 'discover:MA:72:4', mode: 'discover', state_code: 'MA', query_offset: 72, query_limit: 4
    }
  }));
  assert.equal(decision.action, 'trigger_discovery');
  assert.equal(decision.state_code, 'MA');
  assert.equal(decision.query_offset, 72);
});

test('deferred discovery replay resolves only after its exact query offset advanced', () => {
  const decision = shadowControllerDecision(baseState({
    status: 'ready',
    query_offsets: { MA: 76, CA: 144 },
    deferred_replay_inflight: {
      key: 'discover:MA:72:4', mode: 'discover', state_code: 'MA', query_offset: 72, query_limit: 4
    }
  }));
  assert.equal(decision.action, 'resume_deferred_replay');
  assert.equal(decision.key, 'discover:MA:72:4');
});

test('freshly scheduled deferred acquisition replay runs even when numeric target was already reached', () => {
  const decision = shadowControllerDecision(baseState({
    status: 'ready_acquisition',
    snapshot_count: 1200,
    target_count: 1200,
    current: { state_code: 'NY', source_pr: 1656 },
    pending_source_ids: ['ny-a'],
    acquisition_batch: 2,
    deferred_replay_inflight: {
      key: 'acquire:NY:2', mode: 'acquire', state_code: 'NY', batch_number: 2, source_ids: ['ny-a']
    }
  }));
  assert.equal(decision.action, 'trigger_acquisition_or_advance_batch');
  assert.equal(decision.state_code, 'NY');
  assert.equal(decision.batch_number, 2);
});
