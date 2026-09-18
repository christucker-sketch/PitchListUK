import {
  inspectControllerPr,
  inspectDataMergeChecks as inspectBrokerDataMergeChecks,
  inspectSourceMergeChecks as inspectBrokerSourceMergeChecks,
  mergeControllerPr
} from './controller-github-client.mjs';

const UK_SOURCE_REGISTRY_PATH = 'operations/opportunity-pipeline/config/approved-source-routes.json';
const UK_SNAPSHOT_PATH = 'functions/_data/opportunities.mjs';
const UK_HOMEPAGE_PATH = 'public/index.html';

function successfulChecks(checkRuns) {
  const runs = Array.isArray(checkRuns) ? checkRuns : [];
  if (!runs.length) return false;
  return runs.every(run => run?.status === 'completed' && ['success', 'neutral', 'skipped'].includes(String(run?.conclusion || '')));
}

function compactChecks(body) {
  return Array.isArray(body?.check_runs)
    ? body.check_runs.map(run => ({ id: run.id, name: run.name, status: run.status, conclusion: run.conclusion }))
    : [];
}

export async function inspectUkControllerPr(env, prNumber) {
  const number = Number(prNumber);
  if (!Number.isInteger(number) || number <= 0) throw new Error('uk_controller_pr_number_invalid');
  const pr = await inspectControllerPr(env, number);
  const headSha = String(pr?.head_sha || '').toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(headSha)) throw new Error('uk_controller_pr_head_sha_invalid');
  return Object.freeze({
    number,
    state: String(pr?.state || '').toUpperCase(),
    merged: Boolean(pr?.merged),
    merged_at: pr?.merged_at || null,
    merge_commit_sha: String(pr?.merge_commit_sha || '').toLowerCase() || null,
    draft: Boolean(pr?.draft),
    mergeable: pr?.mergeable,
    mergeable_state: String(pr?.mergeable_state || ''),
    base_ref: String(pr?.base_ref || ''),
    base_sha: String(pr?.base_sha || '').toLowerCase(),
    head_ref: String(pr?.head_ref || ''),
    head_sha: headSha,
    body: String(pr?.body || ''),
    files: Object.freeze((Array.isArray(pr?.files) ? pr.files : []).map(file => String(file?.path || file || ''))),
    commits: Object.freeze((Array.isArray(pr?.commits) ? pr.commits : []).map(commit => String(commit?.sha || commit || '').toLowerCase())),
    check_runs: Object.freeze(Array.isArray(pr?.check_runs) ? pr.check_runs : [])
  });
}

function requireOpenCandidate(pr) {
  if (pr?.draft) throw new Error('uk_controller_pr_not_open_candidate');
  const state = String(pr?.state || '').toUpperCase();
  if (pr?.merged === true) {
    if (state !== 'CLOSED') throw new Error('uk_controller_pr_merged_state_invalid');
    if (!/^[a-f0-9]{40}$/.test(String(pr?.merge_commit_sha || ''))) throw new Error('uk_controller_existing_merge_sha_invalid');
  } else if (state !== 'OPEN') {
    throw new Error('uk_controller_pr_not_open_candidate');
  }
  if (pr?.base_ref !== 'main') throw new Error('uk_controller_pr_base_not_main');
  if (!/^[a-f0-9]{40}$/.test(String(pr?.base_sha || '')) || !/^[a-f0-9]{40}$/.test(String(pr?.head_sha || ''))) {
    throw new Error('uk_controller_pr_sha_invalid');
  }
}

export function validateUkSourcePr(result, pr) {
  requireOpenCandidate(pr);
  const publication = result?.source_pr;
  const expectedPr = Number(publication?.pr_number);
  const additions = Number(result?.source_additions || publication?.additions || 0);
  if (!Number.isInteger(expectedPr) || expectedPr <= 0 || Number(pr?.number) !== expectedPr) throw new Error('uk_source_pr_number_mismatch');
  if (additions < 1) throw new Error('uk_source_pr_additions_invalid');
  if (!String(pr?.head_ref || '').startsWith('sources/cloud-uk-growth-')) throw new Error('uk_source_pr_head_invalid');
  if (publication?.branch && String(publication.branch) !== String(pr.head_ref)) throw new Error('uk_source_pr_branch_mismatch');
  if (pr.files.length !== 1 || pr.files[0] !== UK_SOURCE_REGISTRY_PATH) throw new Error('uk_source_pr_file_scope_invalid');
  const body = String(pr?.body || '');
  for (const marker of [`- net-new public-service sources: ${additions}`, '- source removals: forbidden', '- automatic merge: disabled']) {
    if (!body.includes(marker)) throw new Error('uk_source_pr_body_evidence_mismatch');
  }
  return Object.freeze({
    ready: successfulChecks(pr.check_runs),
    pr_number: expectedPr,
    head_sha: pr.head_sha,
    base_sha: pr.base_sha,
    additions,
    branch: pr.head_ref
  });
}

export function validateUkDataPr(result, pr) {
  requireOpenCandidate(pr);
  const publication = result?.opportunity_pr;
  const expectedPr = Number(publication?.pr_number);
  const additions = Number(result?.manifest_additions || publication?.additions || 0);
  if (!Number.isInteger(expectedPr) || expectedPr <= 0 || Number(pr?.number) !== expectedPr) throw new Error('uk_data_pr_number_mismatch');
  if (additions < 1) throw new Error('uk_data_pr_additions_invalid');
  if (!String(pr?.head_ref || '').startsWith('data/cloud-uk-approved-additions-')) throw new Error('uk_data_pr_head_invalid');
  if (publication?.branch && String(publication.branch) !== String(pr.head_ref)) throw new Error('uk_data_pr_branch_mismatch');
  const fileSet = new Set(pr.files);
  if (!fileSet.has(UK_SNAPSHOT_PATH) || [...fileSet].some(path => ![UK_SNAPSHOT_PATH, UK_HOMEPAGE_PATH].includes(path))) {
    throw new Error('uk_data_pr_file_scope_invalid');
  }
  const before = Number(result?.production_count_before);
  const after = Number(result?.production_count_after_planned);
  if (!Number.isInteger(before) || !Number.isInteger(after) || after !== before + additions) throw new Error('uk_data_pr_count_delta_invalid');
  const body = String(pr?.body || '');
  for (const marker of [`- production snapshot: ${before} -> ${after}`, `- net-new additions: ${additions}`, '- updates: forbidden', '- removals: forbidden', '- automatic merge: disabled']) {
    if (!body.includes(marker)) throw new Error('uk_data_pr_body_evidence_mismatch');
  }
  return Object.freeze({
    ready: successfulChecks(pr.check_runs),
    pr_number: expectedPr,
    head_sha: pr.head_sha,
    base_sha: pr.base_sha,
    additions,
    before,
    after,
    branch: pr.head_ref
  });
}

export async function mergeUkControllerPr(env, inspection) {
  const prNumber = Number(inspection?.pr_number);
  const headSha = String(inspection?.head_sha || '').toLowerCase();
  const baseSha = String(inspection?.base_sha || '').toLowerCase();
  if (!Number.isInteger(prNumber) || prNumber <= 0 || !/^[a-f0-9]{40}$/.test(headSha) || !/^[a-f0-9]{40}$/.test(baseSha)) {
    throw new Error('uk_controller_merge_precondition_invalid');
  }
  const merged = await mergeControllerPr(env, { pr_number: prNumber, head_sha: headSha, base_sha: baseSha });
  return Object.freeze({
    pr_number: prNumber,
    merge_sha: String(merged.merge_sha).toLowerCase(),
    reused: merged.reused === true
  });
}

export async function inspectUkMergeChecks(env, prNumber, expectedMergeSha, requiredNames = [], kind = 'source') {
  const sha = String(expectedMergeSha || '').toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('uk_controller_merge_sha_invalid');
  const deployment = kind === 'data'
    ? await inspectBrokerDataMergeChecks(env, prNumber)
    : await inspectBrokerSourceMergeChecks(env, prNumber);
  const actualSha = String(deployment?.merge_sha || '').toLowerCase();
  if (actualSha !== sha) throw new Error('uk_controller_merge_sha_mismatch');
  const runs = Array.isArray(deployment?.check_runs) ? deployment.check_runs : [];
  const pending = [];
  for (const name of requiredNames) {
    const matching = runs.filter(run => run.name === name).sort((a, b) => Number(b.id || 0) - Number(a.id || 0))[0];
    if (!matching || matching.status !== 'completed') {
      pending.push(name);
      continue;
    }
    if (matching.conclusion !== 'success') throw new Error(`uk_controller_required_check_failed:${name}:${matching.conclusion || 'unknown'}`);
  }
  return Object.freeze({ ready: pending.length === 0, pending: Object.freeze(pending), check_runs: Object.freeze(runs) });
}

export { UK_SOURCE_REGISTRY_PATH, UK_SNAPSHOT_PATH, UK_HOMEPAGE_PATH };
