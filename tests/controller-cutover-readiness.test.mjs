import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildControllerCutoverReadinessReport,
  readControllerCutoverReadinessReport
} from '../operations/cloudflare-global-acquisition/lib/controller-cutover-readiness.mjs';

function provenUnit() {
  return {
    disposition: 'deferred_for_replay',
    mode: 'acquire',
    state_code: 'TX',
    batch_number: 2,
    source_ids: ['src_a'],
    source_pr: 1656,
    replay_source_provenance: {
      state_code: 'TX',
      source_ids: ['src_a'],
      main_sha: '1'.repeat(40),
      registry_blob_sha: '2'.repeat(40),
      deployment_anchor_sha: '3'.repeat(40),
      deployment_check_id: 99
    }
  };
}

function readyState() {
  const unit = provenUnit();
  return {
    status: 'ready',
    updated_at: '2026-09-10T18:00:01.000Z',
    current: { state_code: 'TX', mode: 'discover' },
    active_instance: null,
    deferred_replay_inflight: null,
    deferred_units: [unit],
    cloud_controller_cutover_preflight: {
      status: 'ready',
      acquisition_replay_count: 1,
      acquisition_replay_keys: ['acquire:TX:2'],
      proven_source_prs: [1656],
      completed_at: '2026-09-10T18:00:00.000Z'
    }
  };
}

test('cutover readiness reports structurally eligible only for exact shadow preflight state', () => {
  const report = buildControllerCutoverReadinessReport(readyState(), {
    authority: 'shadow', version: 12, sha256: 'a'.repeat(64),
    source: 'cloudflare-us-controller-preflight', imported_at: '2026-09-10T18:00:00.500Z'
  });
  assert.equal(report.promotion_structurally_eligible, true);
  assert.equal(report.deferred_acquisition_replay_count, 1);
  assert.equal(report.deferred_acquisition_replay_proven_count, 1);
  assert.equal(report.deferred_acquisition_replay_unproven_count, 0);
  assert.equal(report.preflight_marker_ready, true);
  assert.equal(report.state_source, 'cloudflare-us-controller-preflight');
  assert.equal(report.state_imported_at, '2026-09-10T18:00:00.500Z');
  assert.equal(report.state_updated_at, '2026-09-10T18:00:01.000Z');
  assert.equal(report.current_state_code, 'TX');
  assert.equal(report.current_mode, 'discover');
  assert.deepEqual(report.promotion_blockers, []);
});

test('readiness report exposes unproven replay and marker mismatch without mutating state', () => {
  const state = readyState();
  delete state.deferred_units[0].source_pr;
  const before = JSON.stringify(state);
  const report = buildControllerCutoverReadinessReport(state, {
    authority: 'shadow', version: 12, sha256: 'a'.repeat(64)
  });
  assert.equal(report.promotion_structurally_eligible, false);
  assert.equal(report.deferred_acquisition_replay_unproven_count, 1);
  assert.ok(report.promotion_blockers.some(value => value.includes('unproven_deferred_acquisition_replays:1')));
  assert.equal(JSON.stringify(state), before);
});

test('readiness report exposes exact inflight replay identity', () => {
  const state = readyState();
  state.deferred_replay_inflight = {
    key: 'discover:NY:8:2', mode: 'discover', state_code: 'NY', query_offset: 8, query_limit: 2
  };
  state.active_instance = { id: 'cf_active' };
  const report = buildControllerCutoverReadinessReport(state, {
    authority: 'shadow', version: 12, sha256: 'a'.repeat(64)
  });
  assert.equal(report.promotion_structurally_eligible, false);
  assert.equal(report.deferred_replay_inflight, true);
  assert.equal(report.deferred_replay_inflight_key, 'discover:NY:8:2');
  assert.equal(report.deferred_replay_inflight_mode, 'discover');
  assert.equal(report.deferred_replay_inflight_state_code, 'NY');
  assert.equal(report.active_instance_id, 'cf_active');
  assert.ok(report.promotion_blockers.includes('deferred_replay_inflight'));
});

test('readiness report never calls non-shadow authority structurally eligible', () => {
  const report = buildControllerCutoverReadinessReport(readyState(), {
    authority: 'authoritative', version: 12, sha256: 'a'.repeat(64)
  });
  assert.equal(report.promotion_structurally_eligible, false);
  assert.ok(report.promotion_blockers.includes('authority:authoritative'));
});

test('tokenless readiness reader performs one exact Durable Object snapshot GET and exposes provenance headers', async () => {
  const calls = [];
  const env = {
    CONTROLLER_STATE: {
      idFromName(name) {
        assert.equal(name, 'us-controller');
        return 'us-controller-id';
      },
      get(id) {
        assert.equal(id, 'us-controller-id');
        return {
          async fetch(request) {
            calls.push(String(request));
            return new Response(JSON.stringify(readyState()), {
              status: 200,
              headers: {
                'x-findpitches-state-authority': 'shadow',
                'x-findpitches-state-version': '12',
                'x-findpitches-state-sha256': 'a'.repeat(64),
                'x-findpitches-state-source': 'cloudflare-us-controller-preflight',
                'x-findpitches-state-imported-at': '2026-09-10T18:00:00.500Z'
              }
            });
          }
        };
      }
    }
  };
  const report = await readControllerCutoverReadinessReport(env);
  assert.equal(report.promotion_structurally_eligible, true);
  assert.equal(report.state_source, 'cloudflare-us-controller-preflight');
  assert.equal(report.state_imported_at, '2026-09-10T18:00:00.500Z');
  assert.deepEqual(calls, ['https://controller-state.internal/snapshot']);
});
