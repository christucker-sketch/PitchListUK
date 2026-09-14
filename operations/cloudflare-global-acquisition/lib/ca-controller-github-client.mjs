import { githubJson } from './github-publication.mjs';

const CA_SOURCE_REGISTRY_PATH = 'operations/opportunity-pipeline/config/ca-approved-source-routes.json';

export function latestCaCheckRuns(checkRuns) {
  const latest = new Map();
  for (const run of Array.isArray(checkRuns) ? checkRuns : []) {
    const id = Number(run?.id || 0);
    const name = String(run?.name || '').trim();
    const key = name || `__unnamed_check_${id}`;
    const previous = latest.get(key);
    if (!previous || id > Number(previous?.id || 0)) latest.set(key, run);
  }
  return Object.freeze([...latest.values()]);
}

export function latestCaChecksSuccessful(checkRuns) {
  const runs = latestCaCheckRuns(checkRuns);
  if (!runs.length) return false;
  return runs.every(run => run?.status === 'completed' && ['success', 'neutral', 'skipped'].includes(String(run?.conclusion || '')));
}

function compactChecks(body) {
  return Array.isArray(body?.check_runs)
    ? body.check_runs.map(run => ({ id: run.id, name: run.name, status: run.status, conclusion: run.conclusion }))
    : [];
}

export async function inspectCaControllerPr(env, prNumber) {
  const number = Number(prNumber);
  if (!Number.isInteger(number) || number <= 0) throw new Error('ca_controller_pr_number_invalid');
  const pr = await githubJson(env, `/pulls/${number}`);
  const headSha = String(pr?.head?.sha || '').toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(headSha)) throw new Error('ca_controller_pr_head_sha_invalid');
  const [files, commits, checkRuns] = await Promise.all([
    githubJson(env, `/pulls/${number}/files?per_page=100`),
    githubJson(env, `/pulls/${number}/commits?per_page=100`),
    githubJson(env, `/commits/${headSha}/check-runs?per_page=100`)
  ]);
  return Object.freeze({
    number,
    state: String(pr?.state || '').toUpperCase(),
    merged: Boolean(pr?.merged),
    merged_at: pr?.merged_at || null,
    merge_commit_sha: String(pr?.merge_commit_sha || '').toLowerCase() || null,
    draft: Boolean(pr?.draft),
    mergeable: pr?.mergeable,
    mergeable_state: String(pr?.mergeable_state || ''),
    base_ref: String(pr?.base?.ref || ''),
    base_sha: String(pr?.base?.sha || '').toLowerCase(),
    head_ref: String(pr?.head?.ref || ''),
    head_sha: headSha,
    body: String(pr?.body || ''),
    files: Object.freeze((Array.isArray(files) ? files : []).map(file => String(file?.filename || ''))),
    commits: Object.freeze((Array.isArray(commits) ? commits : []).map(commit => String(commit?.sha || '').toLowerCase())),
    check_runs: Object.freeze(compactChecks(checkRuns))
  });
}

function requireOpenCandidate(pr) {
  if (pr?.state !== 'OPEN' || pr?.merged || pr?.draft) throw new Error('ca_controller_pr_not_open_candidate');
  if (pr?.base_ref !== 'main') throw new Error('ca_controller_pr_base_not_main');
  if (!/^[a-f0-9]{40}$/.test(String(pr?.base_sha || '')) || !/^[a-f0-9]{40}$/.test(String(pr?.head_sha || ''))) {
    throw new Error('ca_controller_pr_sha_invalid');
  }
}

export function validateCaSourcePr(result, pr) {
  requireOpenCandidate(pr);
  const publication = result?.source_pr;
  const expectedPr = Number(publication?.pr_number);
  const additions = Number(result?.source_additions || publication?.additions || 0);
  const sourceIds = Array.isArray(result?.source_ids) ? result.source_ids.map(String) : [];
  if (!Number.isInteger(expectedPr) || expectedPr <= 0 || Number(pr?.number) !== expectedPr) throw new Error('ca_source_pr_number_mismatch');
  if (!Number.isInteger(additions) || additions < 1 || sourceIds.length !== additions) throw new Error('ca_source_pr_additions_invalid');
  if (new Set(sourceIds).size !== sourceIds.length || sourceIds.some(id => !/^ca-[a-z]{2}-[a-f0-9]{12}$/.test(id))) throw new Error('ca_source_pr_source_ids_invalid');
  if (!String(pr?.head_ref || '').startsWith('sources/cloud-ca-growth-')) throw new Error('ca_source_pr_head_invalid');
  if (publication?.branch && String(publication.branch) !== String(pr.head_ref)) throw new Error('ca_source_pr_branch_mismatch');
  if (pr.files.length !== 1 || pr.files[0] !== CA_SOURCE_REGISTRY_PATH) throw new Error('ca_source_pr_file_scope_invalid');
  const body = String(pr?.body || '');
  for (const marker of [
    `- net-new approved sources: ${additions}`,
    `- deterministic source evidence receipts: ${additions}/${additions} passed`,
    '- additions only; no source removals',
    '- no automatic merge or deploy requested'
  ]) {
    if (!body.includes(marker)) throw new Error('ca_source_pr_body_evidence_mismatch');
  }
  for (const id of sourceIds) {
    if (!body.includes(`- ${id}:`)) throw new Error('ca_source_pr_receipt_missing');
  }
  return Object.freeze({
    ready: latestCaChecksSuccessful(pr.check_runs),
    pr_number: expectedPr,
    head_sha: pr.head_sha,
    base_sha: pr.base_sha,
    additions,
    source_ids: Object.freeze(sourceIds),
    branch: pr.head_ref
  });
}

export async function mergeCaControllerPr(env, inspection) {
  const prNumber = Number(inspection?.pr_number);
  const headSha = String(inspection?.head_sha || '').toLowerCase();
  if (!Number.isInteger(prNumber) || prNumber <= 0 || !/^[a-f0-9]{40}$/.test(headSha)) throw new Error('ca_controller_merge_precondition_invalid');

  const current = await githubJson(env, `/pulls/${prNumber}`);
  const currentHead = String(current?.head?.sha || '').toLowerCase();
  if (currentHead !== headSha) throw new Error('ca_controller_merge_head_changed');
  if (current?.merged === true) {
    const reusedSha = String(current?.merge_commit_sha || '').toLowerCase();
    if (!/^[a-f0-9]{40}$/.test(reusedSha)) throw new Error('ca_controller_existing_merge_sha_invalid');
    return Object.freeze({ pr_number: prNumber, merge_sha: reusedSha, reused: true });
  }
  if (String(current?.state || '').toUpperCase() !== 'OPEN' || current?.draft) throw new Error('ca_controller_merge_pr_not_open');

  const merged = await githubJson(env, `/pulls/${prNumber}/merge`, {
    method: 'PUT',
    body: JSON.stringify({ sha: headSha, merge_method: 'merge' })
  });
  const mergeSha = String(merged?.sha || '').toLowerCase();
  if (merged?.merged !== true || !/^[a-f0-9]{40}$/.test(mergeSha)) throw new Error(`ca_controller_merge_not_confirmed:${String(merged?.message || '')}`);
  return Object.freeze({ pr_number: prNumber, merge_sha: mergeSha, reused: false });
}

export async function inspectCaMergeChecks(env, mergeSha, requiredNames = []) {
  const sha = String(mergeSha || '').toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('ca_controller_merge_sha_invalid');
  const body = await githubJson(env, `/commits/${sha}/check-runs?per_page=100`);
  const runs = compactChecks(body);
  const pending = [];
  for (const name of requiredNames) {
    const matching = runs.filter(run => run.name === name).sort((a, b) => Number(b.id || 0) - Number(a.id || 0))[0];
    if (!matching || matching.status !== 'completed') {
      pending.push(name);
      continue;
    }
    if (matching.conclusion !== 'success') throw new Error(`ca_controller_required_check_failed:${name}:${matching.conclusion || 'unknown'}`);
  }
  return Object.freeze({ ready: pending.length === 0, pending: Object.freeze(pending), check_runs: Object.freeze(runs) });
}

export { CA_SOURCE_REGISTRY_PATH };
