import test from 'node:test';
import assert from 'node:assert/strict';
import {
  blockCloudController,
  completeCloudController,
  markCloudControllerSweepComplete
} from '../operations/cloudflare-global-acquisition/lib/controller-terminal-lifecycle.mjs';

function baseState(overrides = {}) {
  return {
    status: 'ready', snapshot_count: 706, target_count: 1200,
    priority_order: ['MA', 'CA'], query_offsets: { MA: 144, CA: 144 },
    priority_cursor: 0, current: null, active_instance: null,
    pending_source_ids: [], acquisition_batch: 1,
    deferred_units: [], cloud_controller_intent: null,
    ...overrides
  };
}

test('clean exhausted ready state can checkpoint sweep_complete without changing counts', () => {
  const state = baseState();
  const next = markCloudControllerSweepComplete(state, new Date('2026-09-10T17:00:00.000Z'));
  assert.equal(next.status, 'sweep_complete');
  assert.equal(next.snapshot_count, 706);
  assert.equal(next.sweep_completed_at, '2026-09-10T17:00:00.000Z');
});

test('sweep completion fails closed while current, reserved, pending-source or deferred work exists', () => {
  assert.throws(() => markCloudControllerSweepComplete(baseState({ current: { state_code: 'MA' } })), /current_work_present/);
  assert.throws(() => markCloudControllerSweepComplete(baseState({ cloud_controller_intent: { action: 'x' } })), /reserved_intent_present/);
  assert.throws(() => markCloudControllerSweepComplete(baseState({ pending_source_ids: ['src'] })), /pending_sources_present/);
  assert.throws(() => markCloudControllerSweepComplete(baseState({ deferred_units: [{ disposition: 'deferred_for_replay' }] })), /deferred_replay_pending/);
  assert.throws(() => markCloudControllerSweepComplete(baseState({ deferred_units: [{ disposition: 'genuine_blocker' }] })), /blockers_present/);
});

test('sweep_complete advances idempotently to complete only with no deferred/blocking work', () => {
  const state = baseState({ status: 'sweep_complete' });
  const next = completeCloudController(state, new Date('2026-09-10T17:01:00.000Z'));
  assert.equal(next.status, 'complete');
  assert.equal(next.completed_at, '2026-09-10T17:01:00.000Z');
  const again = completeCloudController(next, new Date('2026-09-10T17:02:00.000Z'));
  assert.equal(again.completed_at, next.completed_at);
});

test('deferred blocker decision records explicit blocked checkpoint', () => {
  const state = baseState({
    status: 'blocked_deferred',
    deferred_units: [{ disposition: 'genuine_blocker', state_code: 'TX', mode: 'discover' }]
  });
  const next = blockCloudController(state, { action: 'block', reason: 'deferred_blocker' }, new Date('2026-09-10T17:03:00.000Z'));
  assert.equal(next.status, 'blocked_deferred');
  assert.equal(next.blocked.reason, 'deferred_blocker');
  assert.equal(next.blocked.blocker_count, 1);
  assert.equal(next.blocked.deferred_count, 0);
});

test('block transition refuses a reason not proven by current checkpoint', () => {
  assert.throws(
    () => blockCloudController(baseState(), { action: 'block', reason: 'deferred_blocker' }),
    /expected_blocker_missing/
  );
  assert.throws(
    () => blockCloudController(baseState(), { action: 'block', reason: 'deferred_replay_attempts_exhausted' }),
    /expected_deferred_missing/
  );
});
