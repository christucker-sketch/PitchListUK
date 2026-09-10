import { proveUsSourceRegistryAdditionsOnly } from './us-source-registry-diff-proof.js';
import { parseGrowthRegistry, sourcesForState } from './us-growth-registry.js';
import { proveUsOpportunitySnapshotAdditionsOnly } from '../../cloudflare-global-acquisition/lib/us-opportunity-snapshot-diff-proof.mjs';

const INTERNAL_HOST = 'findpitches-github-controller.internal';
const INTERNAL_PATH = '/controller-pr';
const INTERNAL_MARKER = 'findpitches-controller-service-v1';
const ALLOWED_HEAD = /^(?:sources\/cloud-us-|data\/cloud-us-)[a-z0-9-]+$/i;
const SOURCE_REGISTRY_PATH = 'operations/opportunity-pipeline/config/us-growth-source-registry.json';
const US_SNAPSHOT_PATH = 'functions/_data/us-opportunities.mjs';

function requireEnv(env, key) {
  const value = String(env?.[key] || '').trim();
  if (!value) throw new Error(`Missing required secret/config: ${key}`);
  return value;
}
function headers(env) {
  return { authorization: `Bearer ${requireEnv(env, 'GITHUB_TOKEN')}`, accept: 'application/vnd.github+json', 'content-type': 'application/json', 'x-github-api-version': '2022-11-28', 'user-agent': 'findpitches-controller-pr-broker' };
}
export function isInternalGithubControllerRequest(request) {
  let url;
  try { url = new URL(request.url); } catch { return false; }
  return request.method === 'POST' && url.hostname === INTERNAL_HOST && url.pathname === INTERNAL_PATH && request.headers.get('x-findpitches-internal-service') === INTERNAL_MARKER;
}
function validatePayload(payload = {}) {
  const action = String(payload.action || 'inspect');
  if (!['inspect', 'merge', 'inspect_merge_checks', 'inspect_data_merge_checks', 'inspect_replay_source_provenance'].includes(action)) throw new Error('controller_github_action_rejected');
  if (action === 'inspect_replay_source_provenance') {
    const stateCode = String(payload.state_code || '').trim().toUpperCase();
    const sourceIds = [...(Array.isArray(payload.source_ids) ? payload.source_ids : [])]
      .map(value => String(value || '').trim().toLowerCase()).filter(Boolean).sort();
    if (!/^[A-Z]{2}$/.test(stateCode)) throw new Error('controller_github_replay_state_code_invalid');
    if (!sourceIds.length || sourceIds.length > 50 || new Set(sourceIds).size !== sourceIds.length) throw new Error('controller_github_replay_source_ids_invalid');
    return { action, stateCode, sourceIds };
  }
  const prNumber = Number(payload.pr_number);
  if (!Number.isInteger(prNumber) || prNumber <= 0) throw new Error('controller_github_pr_number_invalid');
  const expectedHeadSha = String(payload.expected_head_sha || '').trim().toLowerCase();
  const expectedBaseSha = String(payload.expected_base_sha || '').trim().toLowerCase();
  if (action === 'merge' && !/^[a-f0-9]{40}$/.test(expectedHeadSha)) throw new Error('controller_github_expected_head_sha_invalid');
  if (action === 'merge' && !/^[a-f0-9]{40}$/.test(expectedBaseSha)) throw new Error('controller_github_expected_base_sha_invalid');
  return { action, prNumber, expectedHeadSha, expectedBaseSha };
}
async function githubJson(fetchImpl, url, options) {
  const response = await fetchImpl(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`github_http_${response.status}:${String(body?.message || '')}`);
  return body;
}
function compactChecks(checkRuns) {
  return Array.isArray(checkRuns?.check_runs) ? checkRuns.check_runs.map(run => ({ id: run.id, name: run.name, status: run.status, conclusion: run.conclusion })) : [];
}
function decodeBase64Utf8(content) {
  const binary = atob(String(content || '').replace(/\s+/g, ''));
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
async function fetchFileMetadataAtRef(fetchImpl, repo, authHeaders, path, ref) {
  return githubJson(fetchImpl, `https://api.github.com/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`, { headers: authHeaders });
}
async function fetchFileTextAtRef(fetchImpl, repo, authHeaders, path, ref) {
  const metadata = await fetchFileMetadataAtRef(fetchImpl, repo, authHeaders, path, ref);
  let encoded = String(metadata?.content || '').trim();
  if (!encoded) {
    const gitUrl = String(metadata?.git_url || '');
    if (!gitUrl.startsWith(`https://api.github.com/repos/${repo}/git/blobs/`)) throw new Error('controller_github_blob_url_invalid');
    const blob = await githubJson(fetchImpl, gitUrl, { headers: authHeaders });
    encoded = String(blob?.content || '').trim();
    if (String(blob?.encoding || '').toLowerCase() !== 'base64') throw new Error('controller_github_blob_encoding_invalid');
  } else if (String(metadata?.encoding || '').toLowerCase() !== 'base64') throw new Error('controller_github_content_encoding_invalid');
  if (!encoded) throw new Error('controller_github_content_missing');
  return decodeBase64Utf8(encoded);
}
async function fetchJsonFileAtRef(fetchImpl, repo, authHeaders, path, ref) {
  try { return JSON.parse(await fetchFileTextAtRef(fetchImpl, repo, authHeaders, path, ref)); } catch (error) {
    if (String(error?.message || error).startsWith('controller_github_')) throw error;
    throw new Error('controller_github_json_invalid');
  }
}
function parseUsSnapshotModule(source) {
  const match = String(source || '').match(/export const usOpportunitySnapshot\s*=\s*([\s\S]+);\s*$/);
  if (!match) throw new Error('controller_github_us_snapshot_module_invalid');
  try { return JSON.parse(match[1]); } catch { throw new Error('controller_github_us_snapshot_json_invalid'); }
}
async function sourceRegistryProof(fetchImpl, repo, authHeaders, inspection) {
  if (!String(inspection.head_ref || '').startsWith('sources/cloud-us-')) return null;
  if (inspection.files.length !== 1 || inspection.files[0]?.path !== SOURCE_REGISTRY_PATH) return null;
  const [baseRegistry, headRegistry] = await Promise.all([
    fetchJsonFileAtRef(fetchImpl, repo, authHeaders, SOURCE_REGISTRY_PATH, inspection.base_sha),
    fetchJsonFileAtRef(fetchImpl, repo, authHeaders, SOURCE_REGISTRY_PATH, inspection.head_sha)
  ]);
  return proveUsSourceRegistryAdditionsOnly(baseRegistry, headRegistry);
}
async function dataSnapshotProof(fetchImpl, repo, authHeaders, inspection) {
  if (!String(inspection.head_ref || '').startsWith('data/cloud-us-')) return null;
  if (inspection.files.length !== 1 || inspection.files[0]?.path !== US_SNAPSHOT_PATH) return null;
  const [baseSource, headSource] = await Promise.all([
    fetchFileTextAtRef(fetchImpl, repo, authHeaders, US_SNAPSHOT_PATH, inspection.base_sha),
    fetchFileTextAtRef(fetchImpl, repo, authHeaders, US_SNAPSHOT_PATH, inspection.head_sha)
  ]);
  return proveUsOpportunitySnapshotAdditionsOnly(parseUsSnapshotModule(baseSource), parseUsSnapshotModule(headSource));
}
async function inspectPr(fetchImpl, repo, authHeaders, prNumber) {
  const baseUrl = `https://api.github.com/repos/${repo}`;
  const pr = await githubJson(fetchImpl, `${baseUrl}/pulls/${prNumber}`, { headers: authHeaders });
  const head = String(pr?.head?.ref || '');
  if (!ALLOWED_HEAD.test(head)) throw new Error('controller_github_pr_head_rejected');
  if (String(pr?.base?.ref || '') !== 'main') throw new Error('controller_github_pr_base_rejected');
  const [files, commits, checkRuns] = await Promise.all([
    githubJson(fetchImpl, `${baseUrl}/pulls/${prNumber}/files?per_page=100`, { headers: authHeaders }),
    githubJson(fetchImpl, `${baseUrl}/pulls/${prNumber}/commits?per_page=100`, { headers: authHeaders }),
    githubJson(fetchImpl, `${baseUrl}/commits/${pr.head.sha}/check-runs?per_page=100`, { headers: authHeaders })
  ]);
  const inspection = {
    number: pr.number, state: String(pr.state || '').toUpperCase(), merged: Boolean(pr.merged), draft: Boolean(pr.draft),
    merged_at: pr.merged_at || null, merge_commit_sha: pr.merge_commit_sha || null,
    mergeable: pr.mergeable, mergeable_state: pr.mergeable_state || null,
    base_ref: pr.base.ref, base_sha: pr.base.sha, head_ref: head, head_sha: pr.head.sha, body: String(pr.body || ''),
    files: Array.isArray(files) ? files.map(file => ({ path: file.filename, status: file.status, additions: file.additions, deletions: file.deletions, changes: file.changes })) : [],
    commits: Array.isArray(commits) ? commits.map(commit => ({ sha: commit.sha, parents: Array.isArray(commit.parents) ? commit.parents.map(parent => parent.sha) : [] })) : [],
    check_runs: compactChecks(checkRuns)
  };
  inspection.source_registry_proof = await sourceRegistryProof(fetchImpl, repo, authHeaders, inspection);
  inspection.data_snapshot_proof = await dataSnapshotProof(fetchImpl, repo, authHeaders, inspection);
  return inspection;
}
async function inspectMergedPrChecks(fetchImpl, repo, authHeaders, prNumber, expectedHeadPrefix, errorPrefix) {
  const baseUrl = `https://api.github.com/repos/${repo}`;
  const pr = await githubJson(fetchImpl, `${baseUrl}/pulls/${prNumber}`, { headers: authHeaders });
  const head = String(pr?.head?.ref || '');
  if (!head.startsWith(expectedHeadPrefix)) throw new Error(`controller_github_${errorPrefix}_merge_head_rejected`);
  if (String(pr?.base?.ref || '') !== 'main' || !pr?.merged || !pr?.merged_at) throw new Error(`controller_github_${errorPrefix}_pr_not_merged`);
  const mergeSha = String(pr?.merge_commit_sha || '').toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(mergeSha)) throw new Error(`controller_github_${errorPrefix}_merge_sha_invalid`);
  const checkRuns = await githubJson(fetchImpl, `${baseUrl}/commits/${mergeSha}/check-runs?per_page=100`, { headers: authHeaders });
  return { pr_number: Number(pr.number), merge_sha: mergeSha, merged_at: pr.merged_at, check_runs: compactChecks(checkRuns) };
}
async function inspectSourceMergeChecks(fetchImpl, repo, authHeaders, prNumber) {
  return inspectMergedPrChecks(fetchImpl, repo, authHeaders, prNumber, 'sources/cloud-us-', 'source');
}
async function inspectDataMergeChecks(fetchImpl, repo, authHeaders, prNumber) {
  return inspectMergedPrChecks(fetchImpl, repo, authHeaders, prNumber, 'data/cloud-us-', 'data');
}

function successfulNamedCheck(checkRuns, name) {
  return compactChecks(checkRuns).some(run => run.name === name && run.status === 'completed' && run.conclusion === 'success');
}

async function inspectReplaySourceProvenance(fetchImpl, repo, authHeaders, stateCode, sourceIds) {
  const baseUrl = `https://api.github.com/repos/${repo}`;
  const mainRef = await githubJson(fetchImpl, `${baseUrl}/git/ref/heads/main`, { headers: authHeaders });
  const mainSha = String(mainRef?.object?.sha || '').toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(mainSha)) throw new Error('controller_github_replay_main_sha_invalid');

  const currentMetadata = await fetchFileMetadataAtRef(fetchImpl, repo, authHeaders, SOURCE_REGISTRY_PATH, mainSha);
  const registryBlobSha = String(currentMetadata?.sha || '').toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(registryBlobSha)) throw new Error('controller_github_replay_registry_blob_invalid');
  const registry = parseGrowthRegistry(await fetchJsonFileAtRef(fetchImpl, repo, authHeaders, SOURCE_REGISTRY_PATH, mainSha));
  const selected = sourcesForState(registry, stateCode, sourceIds);
  const selectedIds = selected.map(source => source.id).sort();
  if (selectedIds.length !== sourceIds.length || JSON.stringify(selectedIds) !== JSON.stringify(sourceIds)) throw new Error('controller_github_replay_sources_not_exact');

  const history = await githubJson(fetchImpl, `${baseUrl}/commits?sha=main&path=${encodeURIComponent(SOURCE_REGISTRY_PATH)}&per_page=20`, { headers: authHeaders });
  if (!Array.isArray(history) || !history.length) throw new Error('controller_github_replay_registry_history_missing');

  for (const candidate of history) {
    const sourceHeadSha = String(candidate?.sha || '').toLowerCase();
    if (!/^[a-f0-9]{40}$/.test(sourceHeadSha)) continue;
    const candidateMetadata = await fetchFileMetadataAtRef(fetchImpl, repo, authHeaders, SOURCE_REGISTRY_PATH, sourceHeadSha).catch(() => null);
    if (String(candidateMetadata?.sha || '').toLowerCase() !== registryBlobSha) continue;

    const pulls = await githubJson(fetchImpl, `${baseUrl}/commits/${sourceHeadSha}/pulls`, { headers: { ...authHeaders, accept: 'application/vnd.github+json' } });
    const merged = (Array.isArray(pulls) ? pulls : []).find(pr => pr?.merged_at && pr?.merge_commit_sha && String(pr?.base?.ref || '') === 'main');
    if (!merged) continue;
    const deploymentAnchorSha = String(merged.merge_commit_sha || '').toLowerCase();
    if (!/^[a-f0-9]{40}$/.test(deploymentAnchorSha)) continue;

    const [anchorMetadata, comparison, checkRuns] = await Promise.all([
      fetchFileMetadataAtRef(fetchImpl, repo, authHeaders, SOURCE_REGISTRY_PATH, deploymentAnchorSha),
      githubJson(fetchImpl, `${baseUrl}/compare/${deploymentAnchorSha}...${mainSha}`, { headers: authHeaders }),
      githubJson(fetchImpl, `${baseUrl}/commits/${deploymentAnchorSha}/check-runs?per_page=100`, { headers: authHeaders })
    ]);
    const deploymentRegistryBlobSha = String(anchorMetadata?.sha || '').toLowerCase();
    const ancestor = deploymentAnchorSha === mainSha || String(comparison?.merge_base_commit?.sha || '').toLowerCase() === deploymentAnchorSha;
    if (deploymentRegistryBlobSha !== registryBlobSha || !ancestor) continue;
    if (!successfulNamedCheck(checkRuns, 'verify') || !successfulNamedCheck(checkRuns, 'deploy_acquisition_worker_production')) continue;

    return {
      state_code: stateCode,
      source_ids: selectedIds,
      main_sha: mainSha,
      registry_blob_sha: registryBlobSha,
      deployment_anchor_sha: deploymentAnchorSha,
      deployment_registry_blob_sha: deploymentRegistryBlobSha,
      deployment_anchor_is_main_ancestor: true,
      source_pr_number: Number(merged.number || 0) || null,
      source_head_sha: sourceHeadSha,
      check_runs: compactChecks(checkRuns)
    };
  }
  throw new Error('controller_github_replay_deployed_registry_proof_missing');
}

export async function handleInternalGithubControllerRequest(request, env, options = {}) {
  if (!isInternalGithubControllerRequest(request)) return new Response('Not found', { status: 404 });
  let payload;
  try { payload = validatePayload(await request.json()); } catch (error) { return Response.json({ ok: false, error: String(error?.message || error) }, { status: 400 }); }
  const repo = requireEnv(env, 'GITHUB_REPO');
  const fetchImpl = options.fetchImpl || fetch;
  const authHeaders = headers(env);
  try {
    if (payload.action === 'inspect_replay_source_provenance') return Response.json({ ok: true, provenance: await inspectReplaySourceProvenance(fetchImpl, repo, authHeaders, payload.stateCode, payload.sourceIds) });
    if (payload.action === 'inspect_merge_checks') return Response.json({ ok: true, deployment: await inspectSourceMergeChecks(fetchImpl, repo, authHeaders, payload.prNumber) });
    if (payload.action === 'inspect_data_merge_checks') return Response.json({ ok: true, deployment: await inspectDataMergeChecks(fetchImpl, repo, authHeaders, payload.prNumber) });
    const inspection = await inspectPr(fetchImpl, repo, authHeaders, payload.prNumber);
    if (payload.action === 'inspect') return Response.json({ ok: true, pr: inspection });
    if (String(inspection.base_sha).toLowerCase() !== payload.expectedBaseSha) throw new Error('controller_github_pr_base_sha_mismatch');
    if (String(inspection.head_sha).toLowerCase() !== payload.expectedHeadSha) throw new Error('controller_github_pr_head_sha_mismatch');
    if (inspection.merged) {
      const mergeSha = String(inspection.merge_commit_sha || '');
      if (!inspection.merged_at || !/^[a-f0-9]{40}$/i.test(mergeSha)) throw new Error('controller_github_existing_merge_not_proven');
      return Response.json({ ok: true, merged: true, reused: true, merge_sha: mergeSha, pr_number: payload.prNumber, base_sha: inspection.base_sha, head_sha: inspection.head_sha });
    }
    if (inspection.state !== 'OPEN' || inspection.draft) throw new Error('controller_github_pr_not_open_mergeable_candidate');
    const merge = await githubJson(fetchImpl, `https://api.github.com/repos/${repo}/pulls/${payload.prNumber}/merge`, { method: 'PUT', headers: authHeaders, body: JSON.stringify({ sha: payload.expectedHeadSha, merge_method: 'merge' }) });
    if (!merge?.merged || !/^[a-f0-9]{40}$/i.test(String(merge.sha || ''))) throw new Error('controller_github_merge_not_confirmed');
    return Response.json({ ok: true, merged: true, reused: false, merge_sha: merge.sha, pr_number: payload.prNumber, base_sha: inspection.base_sha, head_sha: inspection.head_sha });
  } catch (error) {
    return Response.json({ ok: false, error: String(error?.message || error) }, { status: 409 });
  }
}

export const INTERNAL_GITHUB_CONTROLLER_BROKER = Object.freeze({ host: INTERNAL_HOST, path: INTERNAL_PATH, marker: INTERNAL_MARKER });
