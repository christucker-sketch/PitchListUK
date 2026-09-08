import assert from 'node:assert/strict';
import test from 'node:test';

import { buildObserverStatus } from '../operations/cloudflare-findpitches-observer/scripts/observer-status-source.mjs';

test('observer prefers a newer re-armed checkpoint over stale sweep-complete log data', () => {
  const checkpoint = {
    status: 'running_cloudflare_discovery',
    target_count: 1200,
    snapshot_count: 608,
    live_api_count: 608,
    approved_source_count: 1295,
    updated_at: '2026-09-08T11:04:30.000Z',
    priority_order: ['CA', 'TX'],
    priority_cursor: 0,
    query_offsets: { CA: 0, TX: 0 },
    current: { mode: 'discover', state_code: 'CA', query_offset: 0, query_limit: 4 },
    active_instance: { id: 'cf_test', mode: 'discover', state_code: 'CA' },
    deferred_units: []
  };
  const operational = {
    status: 'sweep_complete',
    target_count: 1100,
    snapshot_count: 608,
    live_api_count: 608,
    approved_source_count: 1295,
    updated_at: '2026-09-07T17:58:52.644Z',
    current: null,
    active_instance: null,
    sweep: {
      states_total: 2,
      states_started: 2,
      states_discovery_complete: 2,
      completed_state_codes: ['CA', 'TX'],
      sweep_completed_at: '2026-09-07T17:58:52.644Z',
      deferred_units: 0,
      deferred_blockers: 0,
      replay_inflight: null
    }
  };

  const status = buildObserverStatus(checkpoint, operational, 2);

  assert.equal(status.status_source, 'controller_checkpoint');
  assert.equal(status.controller_status, 'running_cloudflare_discovery');
  assert.equal(status.target_count, 1200);
  assert.equal(status.current.state_code, 'CA');
  assert.equal(status.current.query_limit, 4);
  assert.equal(status.active_instance.id, 'cf_test');
  assert.equal(status.sweep.states_started, 1);
  assert.equal(status.sweep.states_discovery_complete, 0);
  assert.deepEqual(status.sweep.completed_state_codes, []);
  assert.equal(status.sweep.nationwide_complete, false);
  assert.equal(status.sweep.completion_gap, 2);
  assert.equal(status.sweep.sweep_completed_at, null);
});

test('observer preserves a newer completed operational sweep', () => {
  const checkpoint = {
    status: 'ready',
    target_count: 1100,
    snapshot_count: 608,
    updated_at: '2026-09-07T17:50:00.000Z'
  };
  const operational = {
    status: 'sweep_complete',
    target_count: 1100,
    snapshot_count: 608,
    updated_at: '2026-09-07T17:58:52.644Z',
    sweep: {
      states_total: 2,
      states_started: 2,
      states_discovery_complete: 2,
      completed_state_codes: ['CA', 'TX'],
      sweep_completed_at: '2026-09-07T17:58:52.644Z',
      deferred_units: 0,
      deferred_blockers: 0,
      replay_inflight: null
    }
  };

  const status = buildObserverStatus(checkpoint, operational, 2);

  assert.equal(status.status_source, 'controller_compact_log');
  assert.equal(status.controller_status, 'sweep_complete');
  assert.equal(status.sweep.nationwide_complete, true);
  assert.equal(status.sweep.completion_gap, 0);
});
