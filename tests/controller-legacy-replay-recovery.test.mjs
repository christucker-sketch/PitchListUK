import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FAILED_LEGACY_REPLAY_TARGET,
  legacyReplayRecoveryAlreadyApplied,
  recoverFailedLegacyReplayState
} from '../operations/cloudflare-global-acquisition/lib/controller-legacy-replay-recovery.mjs';

function targetState() {
  const deferred = {
    disposition: 'deferred_for_replay',
    mode: 'discover',
    state_code: 'MI',
    query_offset: 128,
    query_limit: 4,
    replay_attempts: 1,
    first_deferred_at: '2026-09-10T11:40:00.000Z',
    last_deferred_at: '2026-09-10T11:45:00.000Z'
  };
  return {
    status: 'running_cloudflare_discovery',
    updated_at: '2026-09-10T11:50:53.898Z',
    priority_order: ['TX', 'MI', 'CA'],
    priority_cursor: 1,
    query_offsets: { TX: 20, MI: 128, CA: 4 },
    current: { mode: 'discover', state_code: 'MI', query_offset: 128, query_limit: 4 },
    active_instance: { id: FAILED_LEGACY_REPLAY_TARGET.instance_id, mode: 'discover', state_code: 'MI' },
    deferred_units: [deferred],
    deferred_replay_inflight: { ...deferred, key: 'discover:MI:128:4', replay_started_at: '2026-09-10T11:50:53.800Z' },
    pending_source_ids: ['should-clear'],
    acquisition_batch: 4,
    cloud_controller_cutover_preflight: { status: 'ready' }
  };
}

test('failed legacy replay recovery returns the exact discovery unit to queue without resolving it', () => {
  const state = targetState();
  const beforeQueue = structuredClone(state.deferred_units);
  const transition = recoverFailedLegacyReplayState(state, new Date('2026-09-10T19:00:00.000Z'));
  const next = transition.next_state;

  assert.equal(transition.replay_key, 'discover:MI:128:4');
  assert.equal(transition.replay_attempts, 1);
  assert.equal(next.status, 'ready');
  assert.equal(next.active_instance, null);
  assert.equal(next.deferred_replay_inflight, null);
  assert.deepEqual(next.deferred_units, beforeQueue);
  assert.equal(next.query_offsets.MI, 128);
  assert.equal(next.priority_cursor, 1);
  assert.equal(next.current, null);
  assert.deepEqual(next.pending_source_ids, []);
  assert.equal(next.acquisition_batch, 1);
  assert.equal(next.cloud_controller_cutover_preflight, undefined);
  assert.equal(next.legacy_replay_recoveries.at(-1).instance_id, FAILED_LEGACY_REPLAY_TARGET.instance_id);
  assert.equal(next.legacy_replay_recoveries.at(-1).workflow_error.message, 'Unexpected end of JSON input');
  assert.equal(next.legacy_replay_recoveries.at(-1).disposition, 'returned_to_deferred_queue');
  assert.equal(state.status, 'running_cloudflare_discovery');
});

test('failed legacy replay recovery fails closed if matching deferred queue identity is missing', () => {
  const state = targetState();
  state.deferred_units = [];
  assert.throws(() => recoverFailedLegacyReplayState(state), /deferred_unit_count:0/);
});

test('failed legacy replay recovery fails closed on active or attempt drift', () => {
  const wrongActive = targetState();
  wrongActive.active_instance.id = 'cf_' + '0'.repeat(64);
  assert.throws(() => recoverFailedLegacyReplayState(wrongActive), /active_instance_mismatch/);

  const wrongAttempt = targetState();
  wrongAttempt.deferred_replay_inflight.replay_attempts = 2;
  assert.throws(() => recoverFailedLegacyReplayState(wrongAttempt), /attempt_mismatch/);
});

test('already-applied recovery requires exact shadow recovery provenance and cleared lease', () => {
  const state = targetState();
  const recovered = recoverFailedLegacyReplayState(state, new Date('2026-09-10T19:00:00.000Z')).next_state;
  const meta = { authority: 'shadow', source: 'cloudflare-us-controller-legacy-recovery' };
  assert.equal(legacyReplayRecoveryAlreadyApplied(recovered, meta), true);
  assert.equal(legacyReplayRecoveryAlreadyApplied(recovered, { ...meta, authority: 'authoritative' }), false);
  assert.equal(legacyReplayRecoveryAlreadyApplied(recovered, { ...meta, source: 'hal-us-growth' }), false);
});
