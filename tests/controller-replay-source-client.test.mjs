import test from 'node:test';
import assert from 'node:assert/strict';
import {
  enrichDeferredAcquisitionReplayUnit,
  proveDeferredAcquisitionUnitSourcesDeployed
} from '../operations/cloudflare-global-acquisition/lib/controller-replay-source-client.mjs';

const sha = char => char.repeat(40);

function unit() {
  return {
    disposition: 'deferred_for_replay', mode: 'acquire', state_code: 'NY', batch_number: 2,
    source_ids: ['ny-b', 'ny-a'], replay_attempts: 0
  };
}

function proof() {
  return {
    state_code: 'NY', source_ids: ['ny-a', 'ny-b'], main_sha: sha('a'), registry_blob_sha: sha('b'),
    deployment_anchor_sha: sha('c'), deployment_check_id: 99, source_pr_number: 1656, source_head_sha: sha('d')
  };
}

test('enrichment binds exact deployed provenance to one legacy deferred acquisition unit', () => {
  const source = unit();
  const result = enrichDeferredAcquisitionReplayUnit({ deferred_units: [source] }, source, proof(), new Date('2026-09-10T18:00:00.000Z'));
  assert.equal(result.source_pr_number, 1656);
  assert.equal(result.next_state.deferred_units[0].source_pr, 1656);
  assert.equal(result.next_state.deferred_units[0].replay_source_provenance.registry_blob_sha, sha('b'));
  assert.deepEqual(result.next_state.deferred_units[0].replay_source_provenance.source_ids, ['ny-a', 'ny-b']);
});

test('enrichment refuses a source-set mismatch', () => {
  const source = unit();
  assert.throws(() => enrichDeferredAcquisitionReplayUnit({ deferred_units: [source] }, source, { ...proof(), source_ids: ['ny-a'] }), /source_ids_mismatch/);
});

test('broker proof must contain exact ids, unchanged registry blob and successful deployment checks', async () => {
  const provenance = {
    state_code: 'NY', source_ids: ['ny-a', 'ny-b'], main_sha: sha('a'), registry_blob_sha: sha('b'),
    deployment_anchor_sha: sha('c'), deployment_registry_blob_sha: sha('b'), deployment_anchor_is_main_ancestor: true,
    source_pr_number: 1656, source_head_sha: sha('d'),
    check_runs: [
      { id: 10, name: 'verify', status: 'completed', conclusion: 'success' },
      { id: 11, name: 'deploy_acquisition_worker_production', status: 'completed', conclusion: 'success' }
    ]
  };
  const env = {
    GITHUB_PR_BROKER: {
      async fetch(request) {
        const body = await request.json();
        assert.equal(body.action, 'inspect_replay_source_provenance');
        assert.equal(body.state_code, 'NY');
        assert.deepEqual(body.source_ids, ['ny-b', 'ny-a']);
        return Response.json({ ok: true, provenance });
      }
    }
  };
  const validated = await proveDeferredAcquisitionUnitSourcesDeployed(env, unit());
  assert.equal(validated.source_pr_number, 1656);
  assert.equal(validated.deployment_check_id, 11);
  assert.deepEqual(validated.source_ids, ['ny-a', 'ny-b']);
});

test('broker proof failure remains fail closed', async () => {
  const env = { GITHUB_PR_BROKER: { fetch: async () => Response.json({ ok: false, error: 'no_proof' }, { status: 409 }) } };
  await assert.rejects(() => proveDeferredAcquisitionUnitSourcesDeployed(env, unit()), /no_proof/);
});
