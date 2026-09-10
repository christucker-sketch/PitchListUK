import test from 'node:test';
import assert from 'node:assert/strict';
import {
  quarantineCloudDeferredReplayExhausted,
  resolveCloudDeferredReplay,
  scheduleCloudDeferredReplay
} from '../operations/cloudflare-global-acquisition/lib/controller-deferred-replay.mjs';

function state(overrides = {}) {
  return {
    status: 'complete',
    snapshot_count: 900,
    target_count: 900,
    priority_order: ['IL', 'TX'],
    priority_cursor: 0,
    query_offsets: { IL: 144, TX: 144 },
    current: null,
    active_instance: null,
    pending_source_ids: [],
    acquisition_batch: 1,
    deferred_units: [],
    deferred_replay_inflight: null,
    resolved_deferred_units: [],
    ...overrides
  };
}

function discoverUnit(overrides = {}) {
  return {
    disposition: 'deferred_for_replay', mode: 'discover', state_code: 'IL',
    query_offset: 68, query_limit: 4, replay_attempts: 0,
    first_deferred_at: '2026-09-05T10:00:00.000Z', last_deferred_at: '2026-09-05T10:00:00.000Z',
    ...overrides
  };
}

function acquireUnit(overrides = {}) {
  return {
    disposition: 'deferred_for_replay', mode: 'acquire', state_code: 'TX',
    batch_number: 2, source_ids: ['src_b', 'src_a'], query_offset: 72,
    replay_attempts: 1,
    first_deferred_at: '2026-09-05T11:00:00.000Z', last_deferred_at: '2026-09-05T11:00:00.000Z',
    ...overrides
  };
}

test('exact discovery replay reuses integrity scheduler, increments attempt and rewinds exact checkpoint', () => {
  const original = state({ deferred_units: [discoverUnit()] });
  const result = scheduleCloudDeferredReplay(original, {
    action: 'schedule_deferred_replay', mode: 'discover', state_code: 'IL',
    query_offset: 68, query_limit: 4, replay_attempts: 0
  }, new Date('2026-09-10T17:10:00.000Z'));

  assert.equal(original.deferred_replay_inflight, null);
  assert.equal(original.query_offsets.IL, 144);
  assert.equal(result.key, 'discover:IL:68:4');
  assert.equal(result.next_state.status, 'ready');
  assert.equal(result.next_state.query_offsets.IL, 68);
  assert.equal(result.next_state.priority_cursor, 0);
  assert.equal(result.next_state.deferred_units[0].replay_attempts, 1);
  assert.equal(result.next_state.deferred_replay_inflight.key, 'discover:IL:68:4');
});

test('exact acquisition replay preserves source checkpoint and batch', () => {
  const original = state({ deferred_units: [acquireUnit()] });
  const result = scheduleCloudDeferredReplay(original, {
    action: 'schedule_deferred_replay_after_plan_exhaustion', mode: 'acquire', state_code: 'TX',
    query_offset: 72, query_limit: null, batch_number: 2, replay_attempts: 1
  }, new Date('2026-09-10T17:11:00.000Z'));

  assert.equal(result.key, 'acquire:TX:2');
  assert.equal(result.next_state.status, 'ready_acquisition');
  assert.deepEqual(result.next_state.pending_source_ids, ['src_b', 'src_a']);
  assert.equal(result.next_state.acquisition_batch, 2);
  assert.equal(result.next_state.current.state_code, 'TX');
  assert.equal(result.next_state.current.replay_deferred_key, 'acquire:TX:2');
  assert.equal(result.next_state.deferred_units[0].replay_attempts, 2);
});

test('stale replay decision fails before mutating source state', () => {
  const original = state({ deferred_units: [discoverUnit()] });
  assert.throws(() => scheduleCloudDeferredReplay(original, {
    action: 'schedule_deferred_replay', mode: 'discover', state_code: 'IL',
    query_offset: 72, query_limit: 4, replay_attempts: 0
  }), /deferred_replay_decision_query_offset_mismatch/);
  assert.equal(original.query_offsets.IL, 144);
  assert.equal(original.deferred_units[0].replay_attempts, 0);
});

test('proven Sep 5 quarantine behavior skips exhausted first item and schedules later recoverable unit', () => {
  const original = state({ deferred_units: [
    discoverUnit({ replay_attempts: 3 }),
    acquireUnit({ replay_attempts: 1 })
  ] });
  const result = scheduleCloudDeferredReplay(original, {
    action: 'schedule_deferred_replay', mode: 'acquire', state_code: 'TX',
    query_offset: 72, query_limit: null, batch_number: 2, replay_attempts: 1
  }, new Date('2026-09-10T17:12:00.000Z'), { maximumAttempts: 3 });

  assert.equal(result.next_state.deferred_units[0].disposition, 'genuine_blocker');
  assert.equal(result.next_state.deferred_units[1].replay_attempts, 2);
  assert.equal(result.next_state.deferred_replay_inflight.key, 'acquire:TX:2');
  assert.equal(result.next_state.status, 'ready_acquisition');
});

test('all exhausted pending units are quarantined as genuine blockers before blocked state', () => {
  const original = state({ deferred_units: [
    discoverUnit({ replay_attempts: 3 }),
    acquireUnit({ replay_attempts: 4 })
  ] });
  const result = quarantineCloudDeferredReplayExhausted(original, {
    action: 'block', reason: 'deferred_replay_attempts_exhausted', pending_count: 2
  }, new Date('2026-09-10T17:13:00.000Z'), { maximumAttempts: 3 });

  assert.equal(result.next_state.status, 'blocked_deferred');
  assert.equal(result.blocker_count, 2);
  assert.equal(result.next_state.deferred_units.every(unit => unit.disposition === 'genuine_blocker'), true);
  assert.equal(result.next_state.blocked.reason, 'deferred_replay_attempts_exhausted');
  assert.equal(original.deferred_units[0].disposition, 'deferred_for_replay');
});

test('quarantine fails closed if a recoverable candidate still exists', () => {
  const original = state({ deferred_units: [discoverUnit({ replay_attempts: 2 })] });
  assert.throws(() => quarantineCloudDeferredReplayExhausted(original, {
    action: 'block', reason: 'deferred_replay_attempts_exhausted', pending_count: 1
  }, new Date(), { maximumAttempts: 3 }), /deferred_replay_quarantine_recoverable_candidate_present/);
});

test('resume requires exact inflight identity and moves unit to resolved history', () => {
  const scheduled = scheduleCloudDeferredReplay(state({ deferred_units: [discoverUnit()] }), {
    action: 'schedule_deferred_replay', mode: 'discover', state_code: 'IL',
    query_offset: 68, query_limit: 4, replay_attempts: 0
  }, new Date('2026-09-10T17:14:00.000Z')).next_state;

  const result = resolveCloudDeferredReplay(scheduled, {
    action: 'resume_deferred_replay', mode: 'discover', state_code: 'IL', key: 'discover:IL:68:4'
  }, new Date('2026-09-10T17:15:00.000Z'));

  assert.equal(result.key, 'discover:IL:68:4');
  assert.equal(result.next_state.deferred_replay_inflight, null);
  assert.equal(result.next_state.deferred_units.length, 0);
  assert.equal(result.next_state.resolved_deferred_units.length, 1);
  assert.equal(result.next_state.resolved_deferred_units[0].disposition, 'replayed_successfully');
});

test('resume with wrong replay key fails closed without changing inflight state', () => {
  const scheduled = scheduleCloudDeferredReplay(state({ deferred_units: [discoverUnit()] }), {
    action: 'schedule_deferred_replay', mode: 'discover', state_code: 'IL',
    query_offset: 68, query_limit: 4, replay_attempts: 0
  }).next_state;
  assert.throws(() => resolveCloudDeferredReplay(scheduled, {
    action: 'resume_deferred_replay', mode: 'discover', state_code: 'IL', key: 'discover:IL:72:4'
  }), /deferred_replay_resume_identity_mismatch/);
  assert.equal(scheduled.deferred_replay_inflight.key, 'discover:IL:68:4');
});
