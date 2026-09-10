import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyFrontendProductionDeployment,
  inspectDataMergeChecks
} from '../operations/cloudflare-global-acquisition/lib/controller-github-client.mjs';

const mergeSha = 'c'.repeat(40);

function deployment(overrides = {}) {
  return {
    pr_number: 1701,
    merge_sha: mergeSha,
    check_runs: [
      { id: 10, name: 'verify', status: 'completed', conclusion: 'success' },
      { id: 11, name: 'deploy_frontend_production', status: 'completed', conclusion: 'success' }
    ],
    ...overrides
  };
}

test('data merge check client uses the bounded data deployment broker action', async () => {
  let payload = null;
  const env = {
    GITHUB_PR_BROKER: {
      async fetch(request) {
        payload = JSON.parse(await request.text());
        return Response.json({ ok: true, deployment: deployment() });
      }
    }
  };
  const inspected = await inspectDataMergeChecks(env, 1701);
  assert.deepEqual(payload, { action: 'inspect_data_merge_checks', pr_number: 1701 });
  assert.equal(inspected.merge_sha, mergeSha);
});

test('frontend production deployment gate requires successful verify and deploy checks on the exact merge SHA', () => {
  assert.deepEqual(classifyFrontendProductionDeployment(deployment()), {
    ready: true,
    status: 'passed',
    merge_sha: mergeSha,
    deployment_check_id: 11
  });
});

test('frontend production deployment gate remains pending until deploy check exists and completes', () => {
  const missing = deployment({ check_runs: [{ id: 10, name: 'verify', status: 'completed', conclusion: 'success' }] });
  assert.deepEqual(classifyFrontendProductionDeployment(missing), {
    ready: false,
    status: 'pending',
    merge_sha: mergeSha,
    waiting_for: 'deploy_frontend_production'
  });
  const running = deployment();
  running.check_runs[1].status = 'in_progress';
  running.check_runs[1].conclusion = null;
  assert.equal(classifyFrontendProductionDeployment(running).ready, false);
});

test('frontend production deployment gate fails closed on failed deploy or malformed merge identity', () => {
  const failed = deployment();
  failed.check_runs[1].conclusion = 'failure';
  assert.throws(() => classifyFrontendProductionDeployment(failed), /data_merge_required_check_failed:deploy_frontend_production:failure/);
  assert.throws(() => classifyFrontendProductionDeployment({ ...deployment(), merge_sha: 'bad' }), /data_merge_deployment_sha_invalid/);
});
