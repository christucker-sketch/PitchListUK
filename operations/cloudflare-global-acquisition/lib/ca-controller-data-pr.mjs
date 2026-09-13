import {
  inspectCaControllerPr,
  inspectCaMergeChecks,
  mergeCaControllerPr
} from './ca-controller-github-client.mjs';

const CA_SNAPSHOT_PATH = 'functions/_data/ca-opportunities.mjs';
const FRONTEND_DEPLOY_CHECKS = Object.freeze(['verify', 'deploy_frontend_production']);

function successfulChecks(checkRuns) {
  const runs = Array.isArray(checkRuns) ? checkRuns : [];
  if (!runs.length) return false;
  return runs.every(run => run?.status === 'completed' && ['success', 'neutral', 'skipped'].includes(String(run?.conclusion || '')));
}

export function validateCaDataPr(result, pr) {
  if (pr?.state !== 'OPEN' || pr?.merged || pr?.draft) throw new Error('ca_data_pr_not_open_candidate');
  if (pr?.base_ref !== 'main') throw new Error('ca_data_pr_base_not_main');
  if (!/^[a-f0-9]{40}$/.test(String(pr?.base_sha || '')) || !/^[a-f0-9]{40}$/.test(String(pr?.head_sha || ''))) throw new Error('ca_data_pr_sha_invalid');

  const publication = result?.opportunity_pr;
  const expectedPr = Number(publication?.pr_number);
  const additions = Number(result?.manifest_additions || publication?.additions || 0);
  const before = Number(result?.production_count_before);
  const after = Number(result?.production_count_after_planned);
  const opportunityIds = Array.isArray(result?.opportunity_ids) ? result.opportunity_ids.map(String) : [];

  if (!Number.isInteger(expectedPr) || expectedPr <= 0 || Number(pr?.number) !== expectedPr) throw new Error('ca_data_pr_number_mismatch');
  if (!Number.isInteger(additions) || additions < 1 || !Number.isInteger(before) || !Number.isInteger(after) || after !== before + additions) throw new Error('ca_data_pr_count_delta_invalid');
  if (opportunityIds.length !== additions || new Set(opportunityIds).size !== opportunityIds.length || opportunityIds.some(id => !/^CA-OPP-[A-F0-9]{12}$/.test(id))) throw new Error('ca_data_pr_opportunity_ids_invalid');
  if (!String(pr?.head_ref || '').startsWith('data/cloud-ca-approved-additions-')) throw new Error('ca_data_pr_head_invalid');
  if (publication?.branch && String(publication.branch) !== String(pr.head_ref)) throw new Error('ca_data_pr_branch_mismatch');
  if (!Array.isArray(pr?.files) || pr.files.length !== 1 || pr.files[0] !== CA_SNAPSHOT_PATH) throw new Error('ca_data_pr_file_scope_invalid');

  const body = String(pr?.body || '');
  for (const marker of [
    `- production snapshot: ${before} -> ${after}`,
    `- net-new additions: ${additions}`,
    '- updates: forbidden',
    '- removals: forbidden',
    '- approved-source direct fetch only',
    '- Serper credits: 0',
    '- automatic merge: disabled',
    '- direct production deployment: disabled'
  ]) {
    if (!body.includes(marker)) throw new Error('ca_data_pr_body_evidence_mismatch');
  }
  for (const id of opportunityIds) {
    if (!body.includes(`- ${id}:`)) throw new Error('ca_data_pr_receipt_missing');
  }

  return Object.freeze({
    ready: successfulChecks(pr.check_runs),
    pr_number: expectedPr,
    head_sha: pr.head_sha,
    base_sha: pr.base_sha,
    additions,
    before,
    after,
    opportunity_ids: Object.freeze(opportunityIds),
    branch: pr.head_ref
  });
}

export async function inspectAndValidateCaDataPr(env, result, prNumber) {
  return validateCaDataPr(result, await inspectCaControllerPr(env, prNumber));
}

export async function mergeValidatedCaDataPr(env, validated) {
  return mergeCaControllerPr(env, validated);
}

export async function inspectCaFrontendDeployment(env, mergeSha) {
  return inspectCaMergeChecks(env, mergeSha, FRONTEND_DEPLOY_CHECKS);
}

export { CA_SNAPSHOT_PATH, FRONTEND_DEPLOY_CHECKS };
