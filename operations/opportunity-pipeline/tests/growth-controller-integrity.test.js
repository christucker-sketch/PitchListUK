import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildOperationalStatus,
  deferredUnitKey,
  pendingDeferredUnits,
  resolveDeferredReplay,
  scheduleNextDeferredReplay,
  upsertDeferredUnit
} from '../../cloudflare-texas-acquisition/scripts/growth-controller-integrity.mjs';

function baseState() {
  return {
    status: 'ready',
    snapshot_count: 411,
    target_count: 1100,
    live_api_count: 411,
    approved_source_count: 828,
    worker_sha: '52d2b0ef7bf20ee550d0868946c5d116c732b3a0',
    worker_version: '949dd267-9b5b-4826-9117-eb0195d4f48b',
    priority_order: ['AZ', 'MA'],
    priority_cursor: 0,
    query_offsets: { AZ: 124, MA: 122 },
    current: null,
    active_instance: null,
    pending_source_ids: [],
    acquisition_batch: 1,
    results: [],
    deployments: [],
    resilience_events: [],
    deferred_units: []
  };
}

test('deferred discovery units are deduplicated and retain replay attempt history', () => {
  const state = baseState();
  const first = {
    at: '2026-09-04T08:00:00.000Z',
    reason: 'confirmed_terminal_workflow',
    mode: 'discover',
    state_code: 'AZ',
    query_offset: 122,
    query_limit: 2,
    disposition: 'deferred_for_replay'
  };
  upsertDeferredUnit(state, first);
  state.deferred_units[0].replay_attempts = 1;
  upsertDeferredUnit(state, { ...first, at: '2026-09-04T09:00:00.000Z', error: 'again' });

  assert.equal(state.deferred_units.length, 1);
  assert.equal(state.deferred_units[0].replay_attempts, 1);
  assert.equal(state.deferred_units[0].first_deferred_at, '2026-09-04T08:00:00.000Z');
  assert.equal(state.deferred_units[0].last_deferred_at, '2026-09-04T09:00:00.000Z');
});

test('deferred Arizona discovery is rewound exactly for replay', () => {
  const state = baseState();
  upsertDeferredUnit(state, {
    at: '2026-09-04T08:00:00.000Z',
    reason: 'confirmed_terminal_workflow',
    mode: 'discover',
    state_code: 'AZ',
    query_offset: 122,
    query_limit: 2,
    disposition: 'deferred_for_replay'
  });

  const replay = scheduleNextDeferredReplay(state, new Date('2026-09-04T10:00:00.000Z'));
  assert.equal(replay.scheduled, true);
  assert.equal(state.query_offsets.AZ, 122);
  assert.equal(state.priority_cursor, 0);
  assert.equal(state.status, 'ready');
  assert.equal(state.deferred_replay_inflight.key, 'discover:AZ:122:2');
  assert.equal(state.deferred_units[0].replay_attempts, 1);
});

test('successful deferred replay removes the unit from the completion queue', () => {
  const state = baseState();
  upsertDeferredUnit(state, {
    at: '2026-09-04T08:00:00.000Z',
    reason: 'confirmed_terminal_workflow',
    mode: 'discover',
    state_code: 'AZ',
    query_offset: 122,
    query_limit: 2,
    disposition: 'deferred_for_replay'
  });
  scheduleNextDeferredReplay(state, new Date('2026-09-04T10:00:00.000Z'));
  const key = resolveDeferredReplay(state, new Date('2026-09-04T10:05:00.000Z'));

  assert.equal(key, deferredUnitKey({ mode: 'discover', state_code: 'AZ', query_offset: 122, query_limit: 2 }));
  assert.equal(pendingDeferredUnits(state).length, 0);
  assert.equal(state.deferred_replay_inflight, null);
  assert.equal(state.resolved_deferred_units[0].disposition, 'replayed_successfully');
});

test('deferred replay becomes a genuine blocker after the bounded retry limit', () => {
  const state = baseState();
  upsertDeferredUnit(state, {
    at: '2026-09-04T08:00:00.000Z',
    reason: 'confirmed_terminal_workflow',
    mode: 'discover',
    state_code: 'AZ',
    query_offset: 122,
    query_limit: 2,
    disposition: 'deferred_for_replay'
  });
  state.deferred_units[0].replay_attempts = 3;

  const replay = scheduleNextDeferredReplay(state, new Date('2026-09-04T10:00:00.000Z'), { maximumAttempts: 3 });
  assert.equal(replay.scheduled, false);
  assert.equal(replay.reason, 'replay_attempts_exhausted');
  assert.equal(state.status, 'blocked_deferred');
  assert.equal(state.deferred_units[0].disposition, 'genuine_blocker');
});

test('exhausted deferred unit is quarantined while a later replayable unit continues', () => {
  const state = baseState();
  upsertDeferredUnit(state, {
    at: '2026-09-04T08:00:00.000Z',
    reason: 'confirmed_terminal_workflow',
    mode: 'discover',
    state_code: 'AZ',
    query_offset: 122,
    query_limit: 2,
    disposition: 'deferred_for_replay'
  });
  upsertDeferredUnit(state, {
    at: '2026-09-04T08:05:00.000Z',
    reason: 'confirmed_terminal_workflow',
    mode: 'discover',
    state_code: 'MA',
    query_offset: 124,
    query_limit: 2,
    disposition: 'deferred_for_replay'
  });
  state.deferred_units[0].replay_attempts = 3;

  const replay = scheduleNextDeferredReplay(state, new Date('2026-09-04T10:00:00.000Z'), { maximumAttempts: 3 });

  assert.equal(replay.scheduled, true);
  assert.equal(state.deferred_units[0].disposition, 'genuine_blocker');
  assert.equal(state.deferred_units[0].blocker_reason, 'Deferred unit failed 3 replay attempt(s)');
  assert.equal(state.deferred_replay_inflight.key, 'discover:MA:124:2');
  assert.equal(state.deferred_units[1].replay_attempts, 1);
  assert.equal(state.status, 'ready');
});

test('operational status exposes sweep progress, current workflow and deferred queue', () => {
  const state = baseState();
  state.status = 'running_cloudflare_discovery';
  state.current = { mode: 'discover', state_code: 'OH', query_offset: 130 };
  state.active_instance = { id: 'cf_example', mode: 'discover', state_code: 'OH' };
  state.resilience_events.push({ reason: 'workflow_describe_retry_exhausted', at: '2026-09-04T10:22:54.849Z' });
  upsertDeferredUnit(state, {
    at: '2026-09-04T08:00:00.000Z',
    reason: 'confirmed_terminal_workflow',
    mode: 'discover',
    state_code: 'AZ',
    query_offset: 122,
    query_limit: 2,
    disposition: 'deferred_for_replay'
  });

  const status = buildOperationalStatus(state);
  assert.equal(status.snapshot_count, 411);
  assert.equal(status.approved_source_count, 828);
  assert.equal(status.current.state_code, 'OH');
  assert.equal(status.active_instance.id, 'cf_example');
  assert.equal(status.sweep.deferred_units, 1);
  assert.equal(status.last_resilience_event.reason, 'workflow_describe_retry_exhausted');
  assert.equal(status.deferred_queue[0].state_code, 'AZ');
});
