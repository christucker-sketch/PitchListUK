import test from 'node:test';
import assert from 'node:assert/strict';
import { handleInternalGithubControllerRequest } from '../operations/cloudflare-texas-acquisition/src/internal-github-controller-broker.js';

function request(body) {
  return new Request('https://findpitches-github-controller.internal/controller-pr', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-findpitches-internal-service': 'findpitches-controller-service-v1' },
    body: JSON.stringify(body)
  });
}

function env() {
  return { GITHUB_REPO: 'christucker-sketch/PitchListUK', GITHUB_TOKEN: 'secret' };
}

function mockFetch({ head = 'data/cloud-us-ma-test', merged = true } = {}) {
  const mergeSha = 'b'.repeat(40);
  return async url => {
    const value = String(url);
    if (/\/pulls\/1700$/.test(value)) return Response.json({
      number: 1700,
      state: merged ? 'closed' : 'open',
      merged,
      merged_at: merged ? '2026-09-10T12:00:00Z' : null,
      merge_commit_sha: merged ? mergeSha : null,
      base: { ref: 'main', sha: 'c'.repeat(40) },
      head: { ref: head, sha: 'a'.repeat(40) }
    });
    if (value.includes(`/commits/${mergeSha}/check-runs`)) return Response.json({ check_runs: [
      { id: 101, name: 'verify', status: 'completed', conclusion: 'success' },
      { id: 102, name: 'deploy_frontend_production', status: 'completed', conclusion: 'success' }
    ] });
    return Response.json({ message: 'not found' }, { status: 404 });
  };
}

test('data merge-check inspection exposes checks from the exact merged data PR commit', async () => {
  const response = await handleInternalGithubControllerRequest(
    request({ action: 'inspect_data_merge_checks', pr_number: 1700 }),
    env(),
    { fetchImpl: mockFetch() }
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.deployment.pr_number, 1700);
  assert.equal(body.deployment.merge_sha, 'b'.repeat(40));
  assert.deepEqual(body.deployment.check_runs, [
    { id: 101, name: 'verify', status: 'completed', conclusion: 'success' },
    { id: 102, name: 'deploy_frontend_production', status: 'completed', conclusion: 'success' }
  ]);
});

test('data merge-check inspection rejects an unmerged data PR', async () => {
  const response = await handleInternalGithubControllerRequest(
    request({ action: 'inspect_data_merge_checks', pr_number: 1700 }),
    env(),
    { fetchImpl: mockFetch({ merged: false }) }
  );
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /controller_github_data_pr_not_merged/);
});

test('data merge-check inspection rejects a source PR even when merged', async () => {
  const response = await handleInternalGithubControllerRequest(
    request({ action: 'inspect_data_merge_checks', pr_number: 1700 }),
    env(),
    { fetchImpl: mockFetch({ head: 'sources/cloud-us-ma-test' }) }
  );
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /controller_github_data_merge_head_rejected/);
});
