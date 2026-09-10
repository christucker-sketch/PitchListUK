import test from 'node:test';
import assert from 'node:assert/strict';
import { handleInternalGithubControllerRequest } from '../operations/cloudflare-texas-acquisition/src/internal-github-controller-broker.js';

function request(body) {
  return new Request('https://findpitches-github-controller.internal/controller-pr', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-findpitches-internal-service': 'findpitches-controller-service-v1' }, body: JSON.stringify(body)
  });
}
function env() { return { GITHUB_REPO: 'christucker-sketch/PitchListUK', GITHUB_TOKEN: 'secret' }; }
function encoded(value) { return Buffer.from(typeof value === 'string' ? value : JSON.stringify(value), 'utf8').toString('base64'); }
function snapshotModule(value) { return `export const usOpportunitySnapshot = ${JSON.stringify(value)};\n`; }

function mockFetch({ head = 'sources/cloud-us-ma-test', sha = 'a'.repeat(40), baseSha = 'c'.repeat(40), mergeSha = 'b'.repeat(40), mutateExisting = false, alreadyMerged = false, mergeChecks = null, dataMode = false, mutateDataExisting = false } = {}) {
  const baseRegistry = { version: 1, updated_at: 'old', sources: [{ id: 'existing', name: 'Existing', region_code: 'MA' }] };
  const headRegistry = { version: 1, updated_at: 'new', sources: [
    mutateExisting ? { id: 'existing', name: 'Changed', region_code: 'MA' } : { ...baseRegistry.sources[0] },
    { id: 'src_new', name: 'New', region_code: 'MA' }
  ] };
  const baseSnapshot = { exported_at: 'old', source: 'old', total: 1, rows: [{ stable_id: 'opp_old', event_name: 'Old', region_code: 'MA' }] };
  const headSnapshot = { exported_at: 'new', source: 'new', total: 2, rows: [
    mutateDataExisting ? { stable_id: 'opp_old', event_name: 'Changed', region_code: 'MA' } : { ...baseSnapshot.rows[0] },
    { stable_id: 'opp_new', event_name: 'New', region_code: 'MA' }
  ] };
  const effectiveHead = dataMode ? 'data/cloud-us-ma-test' : head;
  const effectiveFile = dataMode ? 'functions/_data/us-opportunities.mjs' : 'operations/opportunity-pipeline/config/us-growth-source-registry.json';
  return async (url, options = {}) => {
    const value = String(url);
    if (/\/pulls\/1700$/.test(value)) return Response.json({
      number: 1700,
      state: alreadyMerged ? 'closed' : 'open',
      merged: alreadyMerged,
      merged_at: alreadyMerged ? '2026-09-10T12:00:00Z' : null,
      merge_commit_sha: alreadyMerged ? mergeSha : null,
      draft: false, mergeable: true, mergeable_state: 'clean',
      base: { ref: 'main', sha: baseSha }, head: { ref: effectiveHead, sha }, body: 'body'
    });
    if (/\/pulls\/1700\/files/.test(value)) return Response.json([{ filename: effectiveFile, status: 'modified', additions: 4, deletions: 0, changes: 4 }]);
    if (/\/pulls\/1700\/commits/.test(value)) return Response.json([{ sha, parents: [{ sha: baseSha }] }]);
    if (value.includes(`/commits/${mergeSha}/check-runs`)) return Response.json({ check_runs: mergeChecks || [
      { name: 'verify', status: 'completed', conclusion: 'success' },
      { name: 'deploy_acquisition_worker_production', status: 'completed', conclusion: 'success' }
    ] });
    if (/\/commits\/.+\/check-runs/.test(value)) return Response.json({ check_runs: [{ name: 'PitchList verification', status: 'completed', conclusion: 'success' }] });
    if (value.includes('/contents/operations/opportunity-pipeline/config/us-growth-source-registry.json')) {
      const isBase = value.includes(`ref=${baseSha}`);
      return Response.json({ encoding: 'base64', content: encoded(isBase ? baseRegistry : headRegistry) });
    }
    if (value.includes('/contents/functions/_data/us-opportunities.mjs')) {
      const isBase = value.includes(`ref=${baseSha}`);
      return Response.json({ encoding: 'base64', content: encoded(snapshotModule(isBase ? baseSnapshot : headSnapshot)) });
    }
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
  assert.deepEqual(body.pr.source_registry_proof, { additions_only: true, base_count: 1, head_count: 2, added_count: 1, added_ids: ['src_new'] });
  assert.equal(body.pr.data_snapshot_proof, null);
});

test('controller GitHub broker returns bounded additions-only proof for an exact US data PR snapshot', async () => {
  const response = await handleInternalGithubControllerRequest(request({ action: 'inspect', pr_number: 1700 }), env(), { fetchImpl: mockFetch({ dataMode: true }) });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.pr.head_ref, 'data/cloud-us-ma-test');
  assert.equal(body.pr.source_registry_proof, null);
  assert.deepEqual(body.pr.data_snapshot_proof, { additions_only: true, base_count: 1, head_count: 2, added_count: 1, added_ids: ['opp_new'] });
});

test('controller GitHub broker rejects a data PR that rewrites an existing opportunity', async () => {
  const response = await handleInternalGithubControllerRequest(request({ action: 'inspect', pr_number: 1700 }), env(), { fetchImpl: mockFetch({ dataMode: true, mutateDataExisting: true }) });
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /us_snapshot_opportunity_modified:opp_old/);
});

test('controller GitHub broker rejects non-US acquisition branches', async () => {
  const response = await handleInternalGithubControllerRequest(request({ action: 'inspect', pr_number: 1700 }), env(), { fetchImpl: mockFetch({ head: 'feature/not-acquisition' }) });
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /controller_github_pr_head_rejected/);
});

test('controller GitHub broker fails closed if an existing registry source changed', async () => {
  const response = await handleInternalGithubControllerRequest(request({ action: 'inspect', pr_number: 1700 }), env(), { fetchImpl: mockFetch({ mutateExisting: true }) });
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /source_registry_source_modified:existing/);
});

test('controller GitHub broker merge is pinned to exact inspected base and head SHAs', async () => {
  const sha = 'a'.repeat(40);
  const baseSha = 'c'.repeat(40);
  const response = await handleInternalGithubControllerRequest(request({ action: 'merge', pr_number: 1700, expected_head_sha: sha, expected_base_sha: baseSha }), env(), { fetchImpl: mockFetch({ sha, baseSha }) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).merged, true);

  const staleHead = await handleInternalGithubControllerRequest(request({ action: 'merge', pr_number: 1700, expected_head_sha: 'd'.repeat(40), expected_base_sha: baseSha }), env(), { fetchImpl: mockFetch({ sha, baseSha }) });
  assert.equal(staleHead.status, 409);
  assert.match((await staleHead.json()).error, /head_sha_mismatch/);

  const staleBase = await handleInternalGithubControllerRequest(request({ action: 'merge', pr_number: 1700, expected_head_sha: sha, expected_base_sha: 'e'.repeat(40) }), env(), { fetchImpl: mockFetch({ sha, baseSha }) });
  assert.equal(staleBase.status, 409);
  assert.match((await staleBase.json()).error, /base_sha_mismatch/);
});

test('controller GitHub broker reconciles an already-merged exact PR idempotently', async () => {
  const sha = 'a'.repeat(40);
  const baseSha = 'c'.repeat(40);
  const mergeSha = 'b'.repeat(40);
  const response = await handleInternalGithubControllerRequest(request({ action: 'merge', pr_number: 1700, expected_head_sha: sha, expected_base_sha: baseSha }), env(), { fetchImpl: mockFetch({ sha, baseSha, mergeSha, alreadyMerged: true }) });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.merged, true);
  assert.equal(body.reused, true);
  assert.equal(body.merge_sha, mergeSha);
});

test('controller GitHub broker exposes checks for the exact merged source PR commit', async () => {
  const mergeSha = 'b'.repeat(40);
  const response = await handleInternalGithubControllerRequest(request({ action: 'inspect_merge_checks', pr_number: 1700 }), env(), { fetchImpl: mockFetch({ mergeSha, alreadyMerged: true }) });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.deployment.pr_number, 1700);
  assert.equal(body.deployment.merge_sha, mergeSha);
  assert.deepEqual(body.deployment.check_runs.map(run => run.name), ['verify', 'deploy_acquisition_worker_production']);
});

test('merge-check inspection refuses an unmerged source PR', async () => {
  const response = await handleInternalGithubControllerRequest(request({ action: 'inspect_merge_checks', pr_number: 1700 }), env(), { fetchImpl: mockFetch() });
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /source_pr_not_merged/);
});
