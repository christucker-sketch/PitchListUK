import test from 'node:test';
import assert from 'node:assert/strict';

import {
  acquisitionReplayProvenanceReady,
  assertControllerCutoverPreflightReady,
  legacyAcquisitionReplayUnitsNeedingProof,
  stampControllerCutoverPreflight
} from '../operations/cloudflare-global-acquisition/lib/controller-cutover-preflight.mjs';

function acquire(overrides = {}) {
  return {
    disposition: 'deferred_for_replay', mode: 'acquire', state_code: 'TX', batch_number: 2,
    source_ids: ['src_b', 'src_a'], source_pr: 1656,
    replay_source_provenance: {
      state_code: 'TX', source_ids: ['src_a', 'src_b'], main_sha: 'a'.repeat(40),
      registry_blob_sha: 'b'.repeat(40), deployment_anchor_sha: 'c'.repeat(40),
      deployment_check_id: 123
    },
    ...overrides
  };
}

function state(overrides = {}) {
  return {
    status: 'ready', deferred_units: [acquire()], deferred_replay_inflight: null,
    ...overrides
  };
}

test('cutover preflight accepts exact deployed provenance and stamps deterministic replay identity', () => {
  const original = state();
  assert.equal(acquisitionReplayProvenanceReady(original.deferred_units[0]), true);
  assert.equal(legacyAcquisitionReplayUnitsNeedingProof(original).length, 0);
  const result = stampControllerCutoverPreflight(original, new Date('2026-09-10T18:00:00.000Z'));
  assert.equal(result.acquisition_replay_count, 1);
  assert.deepEqual(result.acquisition_replay_keys, ['acquire:TX:2']);
  assert.equal(result.next_state.cloud_controller_cutover_preflight.status, 'ready');
  assert.deepEqual(result.next_state.cloud_controller_cutover_preflight.proven_source_prs, [1656]);
  assert.equal(original.cloud_controller_cutover_preflight, undefined);
  assert.deepEqual(assertControllerCutoverPreflightReady(result.next_state).acquisition_replay_keys, ['acquire:TX:2']);
});

test('preflight fails closed for missing, mismatched or malformed acquisition replay provenance', () => {
  for (const unit of [
    acquire({ source_pr: undefined }),
    acquire({ replay_source_provenance: undefined }),
    acquire({ replay_source_provenance: { ...acquire().replay_source_provenance, source_ids: ['src_a'] } }),
    acquire({ replay_source_provenance: { ...acquire().replay_source_provenance, registry_blob_sha: 'bad' } })
  ]) {
    const current = state({ deferred_units: [unit] });
    assert.equal(acquisitionReplayProvenanceReady(unit), false);
    assert.equal(legacyAcquisitionReplayUnitsNeedingProof(current).length, 1);
    assert.throws(() => stampControllerCutoverPreflight(current), /cutover_preflight_unproven_acquisition_replay/);
  }
});

test('discovery-only deferred work needs no source deployment provenance', () => {
  const current = state({ deferred_units: [{
    disposition: 'deferred_for_replay', mode: 'discover', state_code: 'IL', query_offset: 68, query_limit: 4
  }] });
  const stamped = stampControllerCutoverPreflight(current).next_state;
  assert.equal(stamped.cloud_controller_cutover_preflight.acquisition_replay_count, 0);
  assert.deepEqual(stamped.cloud_controller_cutover_preflight.acquisition_replay_keys, []);
  assert.doesNotThrow(() => assertControllerCutoverPreflightReady(stamped));
});

test('preflight and promotion contract reject an inflight replay handoff', () => {
  const current = state({ deferred_replay_inflight: acquire({ key: 'acquire:TX:2' }) });
  assert.throws(() => stampControllerCutoverPreflight(current), /cutover_preflight_replay_inflight_present/);
  const stamped = stampControllerCutoverPreflight(state()).next_state;
  stamped.deferred_replay_inflight = acquire({ key: 'acquire:TX:2' });
  assert.throws(() => assertControllerCutoverPreflightReady(stamped), /controller_cutover_preflight_replay_inflight_present/);
});

test('promotion contract detects stale marker count, replay keys and source PR anchors', () => {
  const stamped = stampControllerCutoverPreflight(state()).next_state;
  const staleCount = structuredClone(stamped);
  staleCount.cloud_controller_cutover_preflight.acquisition_replay_count = 0;
  assert.throws(() => assertControllerCutoverPreflightReady(staleCount), /count_mismatch/);

  const staleKey = structuredClone(stamped);
  staleKey.cloud_controller_cutover_preflight.acquisition_replay_keys = ['acquire:TX:3'];
  assert.throws(() => assertControllerCutoverPreflightReady(staleKey), /key_mismatch/);

  const stalePr = structuredClone(stamped);
  stalePr.cloud_controller_cutover_preflight.proven_source_prs = [9999];
  assert.throws(() => assertControllerCutoverPreflightReady(stalePr), /source_pr_mismatch/);
});
