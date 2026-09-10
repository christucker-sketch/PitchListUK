import test from 'node:test';
import assert from 'node:assert/strict';
import { validateReplaySourceDeploymentProof } from '../operations/cloudflare-global-acquisition/lib/controller-replay-source-provenance.mjs';

const sha = value => String(value).repeat(40).slice(0, 40);

function state(overrides = {}) {
  return {
    deferred_replay_inflight: {
      key: 'acquire:NY:2', mode: 'acquire', state_code: 'NY', batch_number: 2,
      source_ids: ['us-new-york-b', 'us-new-york-a'], replay_attempts: 1,
      ...overrides
    }
  };
}

function proof(overrides = {}) {
  return {
    state_code: 'NY',
    source_ids: ['us-new-york-a', 'us-new-york-b'],
    main_sha: sha('a'),
    registry_blob_sha: sha('b'),
    deployment_anchor_sha: sha('c'),
    deployment_registry_blob_sha: sha('b'),
    deployment_anchor_is_main_ancestor: true,
    check_runs: [
      { id: 101, name: 'verify', status: 'completed', conclusion: 'success' },
      { id: 102, name: 'deploy_acquisition_worker_production', status: 'completed', conclusion: 'success' }
    ],
    ...overrides
  };
}

test('accepts exact source set bound to unchanged deployed registry blob', () => {
  const validated = validateReplaySourceDeploymentProof(state(), proof());
  assert.equal(validated.state_code, 'NY');
  assert.deepEqual(validated.source_ids, ['us-new-york-a', 'us-new-york-b']);
  assert.equal(validated.deployment_check_id, 102);
});

test('fails closed if requested legacy source ids do not exactly match proof', () => {
  assert.throws(() => validateReplaySourceDeploymentProof(state(), proof({ source_ids: ['us-new-york-a'] })), /source_ids_mismatch/);
});

test('fails closed when registry blob changed after acquisition Worker deployment', () => {
  assert.throws(() => validateReplaySourceDeploymentProof(state(), proof({ deployment_registry_blob_sha: sha('d') })), /registry_blob_changed_since_deploy/);
});

test('requires deployment anchor to be on current main ancestry', () => {
  assert.throws(() => validateReplaySourceDeploymentProof(state(), proof({ deployment_anchor_is_main_ancestor: false })), /deployment_anchor_not_main_ancestor/);
});

test('requires both verification and acquisition Worker deployment success', () => {
  assert.throws(() => validateReplaySourceDeploymentProof(state(), proof({ check_runs: [
    { id: 101, name: 'verify', status: 'completed', conclusion: 'success' },
    { id: 102, name: 'deploy_acquisition_worker_production', status: 'completed', conclusion: 'failure' }
  ] })), /check_failed:deploy_acquisition_worker_production:failure/);
});

test('rejects state mismatch even when ids happen to match', () => {
  assert.throws(() => validateReplaySourceDeploymentProof(state(), proof({ state_code: 'CA' })), /state_mismatch/);
});
