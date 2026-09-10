import test from 'node:test';
import assert from 'node:assert/strict';

import {
  handleInternalGithubControllerRequest
} from '../operations/cloudflare-texas-acquisition/src/internal-github-controller-broker.js';

function request(body) {
  return new Request('https://findpitches-github-controller.internal/controller-pr', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-findpitches-internal-service': 'findpitches-controller-service-v1'
    },
    body: JSON.stringify(body)
  });
}

function env() {
  return { GITHUB_REPO: 'christucker-sketch/PitchListUK', GITHUB_TOKEN: 'secret' };
}

function mockFetch({ head = 'sources/cloud-us-ma-test', sha = 'a'.repeat(40), mergeSha = 'b'.repeat(40) } = {}) {
  return async (url, options = {}) => {
    const value = String(url);
    if (/\/pulls\/1700$/.test(value)) return Response.json({
      number: 1700, state: 'open', merged: false, draft: false, mergeable: true, mergeable_state: 'clean',
      base: { ref: 'main', sha: 'c'.repeat(40) }, head: { ref: head, sha }, body: 'body'
    });
    if (/\/pulls\/1700\/files/.test(value)) return Response.json([{ filename: 'operations/opportunity-pipeline/config/us-growth-source-registry.json', status: 'modified', additions: 4, deletions: 0, changes: 4 }]);
    if (/\/pulls\/1700\/commits/.test(value)) return Response.json([{ sha, parents: [{ sha: 'c'.repeat(40) }] }]);
    if (/\/commits\/.+\/check-runs/.test(value)) return Response.json({ check_runs: [{ name: 'PitchList verification', status: 'completed', conclusion: 'success' }] });
    if (/\/pulls\/1700\/merge$/.test(value) && options.method === 'PUT') return Response.json({ merged: true, sha: mergeSha });
    return Response.json({ message: 'not found' }, { status: 404 });
  };
}

test('controller GitHub broker inspects only bounded US acquisition PRs', async () => {
  const response = await handleInternalGithubControllerRequest(request({ action: 'inspect', pr_number: 1700 }), env(), { fetchImpl: mockFetch() });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.pr.number, 1700);
  assert.equal(body.pr.head_ref, 'sources/cloud-us-ma-test');
  assert.equal(body.pr.files.length, 1);
  assert.equal(body.pr.commits.length, 1);
  assert.equal(body.pr.check_runs[0].conclusion, 'success');
});

test('controller GitHub broker rejects non-US acquisition branches', async () => {
  const response = await handleInternalGithubControllerRequest(request({ action: 'inspect', pr_number: 1700 }), env(), { fetchImpl: mockFetch({ head: 'feature/not-acquisition' }) });
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /controller_github_pr_head_rejected/);
});

test('controller GitHub broker merge is pinned to the exact inspected head SHA', async () => {
  const sha = 'a'.repeat(40);
  const response = await handleInternalGithubControllerRequest(request({ action: 'merge', pr_number: 1700, expected_head_sha: sha }), env(), { fetchImpl: mockFetch({ sha }) });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.merged, true);
  assert.equal(body.pr_number, 1700);

  const stale = await handleInternalGithubControllerRequest(request({ action: 'merge', pr_number: 1700, expected_head_sha: 'd'.repeat(40) }), env(), { fetchImpl: mockFetch({ sha }) });
  assert.equal(stale.status, 409);
  assert.match((await stale.json()).error, /head_sha_mismatch/);
});
