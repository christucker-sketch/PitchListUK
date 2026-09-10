import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyAcquisitionWorkerDeployment } from '../operations/cloudflare-global-acquisition/lib/controller-github-client.mjs';

const sha = 'a'.repeat(40);

function deployment(checkRuns) {
  return { merge_sha: sha, check_runs: checkRuns };
}

test('acquisition worker deployment is ready only after verify and deploy checks succeed', () => {
  const result = classifyAcquisitionWorkerDeployment(deployment([
    { name: 'verify', status: 'completed', conclusion: 'success' },
    { name: 'deploy_acquisition_worker_production', status: 'completed', conclusion: 'success' }
  ]));
  assert.deepEqual(result, { ready: true, status: 'passed', merge_sha: sha });
});

test('acquisition worker deployment remains pending while a required check is absent or incomplete', () => {
  assert.deepEqual(classifyAcquisitionWorkerDeployment(deployment([
    { name: 'verify', status: 'completed', conclusion: 'success' }
  ])), { ready: false, status: 'pending', merge_sha: sha, waiting_for: 'deploy_acquisition_worker_production' });

  assert.deepEqual(classifyAcquisitionWorkerDeployment(deployment([
    { name: 'verify', status: 'in_progress', conclusion: null },
    { name: 'deploy_acquisition_worker_production', status: 'queued', conclusion: null }
  ])), { ready: false, status: 'pending', merge_sha: sha, waiting_for: 'verify' });
});

test('acquisition worker deployment fails closed on a failed required check', () => {
  assert.throws(() => classifyAcquisitionWorkerDeployment(deployment([
    { name: 'verify', status: 'completed', conclusion: 'success' },
    { name: 'deploy_acquisition_worker_production', status: 'completed', conclusion: 'failure' }
  ])), /source_merge_required_check_failed:deploy_acquisition_worker_production:failure/);
});

test('acquisition worker deployment rejects malformed merge identity', () => {
  assert.throws(() => classifyAcquisitionWorkerDeployment({ merge_sha: 'nope', check_runs: [] }), /source_merge_deployment_sha_invalid/);
});
