import {
  inspectCaControllerPr,
  latestCaChecksSuccessful,
  mergeCaControllerPr
} from './ca-controller-github-client.mjs';
import { inspectDataMergeChecks as inspectBrokerDataMergeChecks } from './controller-github-client.mjs';
import { boundedGithubJson } from './ca-controller-cutover-readiness.mjs';

const CA_SNAPSHOT_PATH = 'functions/_data/ca-opportunities.mjs';
const FRONTEND_DEPLOY_CHECKS = Object.freeze(['verify', 'deploy_frontend_production']);

function latestNamedCheck(checkRuns, name) {
  return (Array.isArray(checkRuns) ? checkRuns : [])
    .filter(run => String(run?.name || '') === name)
    .sort((a, b) => Number(b?.id || 0) - Number(a?.id || 0))[0] || null;
}

async function readCheckRuns(env, sha) {
  const body = await boundedGithubJson(env, `/commits/${sha}/check-runs?per_page=100`);
  return Array.isArray(body?.check_runs) ? body.check_runs : [];
}

async function canadaSnapshotBlobSha(env, ref) {
  const file = await boundedGithubJson(env, `/contents/${CA_SNAPSHOT_PATH}?ref=${encodeURIComponent(ref)}`);
  const sha = String(file?.sha || '').toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('ca_frontend_snapshot_blob_sha_invalid');
  return sha;
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
    ready: latestCaChecksSuccessful(pr.check_runs),
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

export async function inspectCaFrontendDeployment(env, prNumber, mergeSha) {
  const sha = String(mergeSha || '').toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('ca_frontend_merge_sha_invalid');

  const exactDeployment = await inspectBrokerDataMergeChecks(env, prNumber);
  const brokerMergeSha = String(exactDeployment?.merge_sha || '').toLowerCase();
  if (brokerMergeSha !== sha) throw new Error('ca_frontend_merge_sha_mismatch');
  const exactRuns = Array.isArray(exactDeployment?.check_runs) ? exactDeployment.check_runs : [];
  const exactVerify = latestNamedCheck(exactRuns, 'verify');
  const exactDeploy = latestNamedCheck(exactRuns, 'deploy_frontend_production');

  if (exactVerify?.status === 'completed' && exactVerify?.conclusion !== 'success') {
    throw new Error(`ca_controller_required_check_failed:verify:${exactVerify.conclusion || 'unknown'}`);
  }
  if (exactDeploy?.status === 'completed' && !['success', 'skipped'].includes(String(exactDeploy?.conclusion || ''))) {
    throw new Error(`ca_controller_required_check_failed:deploy_frontend_production:${exactDeploy.conclusion || 'unknown'}`);
  }
  if (exactVerify?.status !== 'completed' || exactVerify?.conclusion !== 'success') {
    return Object.freeze({ ready: false, pending: Object.freeze(['verify']), deployment_sha: sha, recovery: false });
  }
  if (exactDeploy?.status === 'completed' && exactDeploy?.conclusion === 'success') {
    return Object.freeze({ ready: true, pending: Object.freeze([]), deployment_sha: sha, recovery: false });
  }
  if (exactDeploy && exactDeploy.status !== 'completed') {
    return Object.freeze({ ready: false, pending: Object.freeze(['deploy_frontend_production']), deployment_sha: sha, recovery: false });
  }

  const ref = await boundedGithubJson(env, '/git/ref/heads/main');
  const mainSha = String(ref?.object?.sha || '').toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(mainSha)) throw new Error('ca_frontend_recovery_main_sha_invalid');
  if (mainSha === sha) {
    return Object.freeze({ ready: false, pending: Object.freeze(['deploy_frontend_production']), deployment_sha: sha, recovery: false });
  }

  const compare = await boundedGithubJson(env, `/compare/${sha}...${mainSha}`);
  if (String(compare?.status || '') !== 'ahead' || String(compare?.merge_base_commit?.sha || '').toLowerCase() !== sha) {
    throw new Error('ca_frontend_recovery_main_not_descendant');
  }

  const [mergedSnapshotSha, currentSnapshotSha] = await Promise.all([
    canadaSnapshotBlobSha(env, sha),
    canadaSnapshotBlobSha(env, mainSha)
  ]);
  if (mergedSnapshotSha !== currentSnapshotSha) throw new Error('ca_frontend_recovery_snapshot_changed');

  const recoveredRuns = await readCheckRuns(env, mainSha);
  const recoveredVerify = latestNamedCheck(recoveredRuns, 'verify');
  const recoveredDeploy = latestNamedCheck(recoveredRuns, 'deploy_frontend_production');
  if (recoveredVerify?.status === 'completed' && recoveredVerify?.conclusion !== 'success') {
    throw new Error(`ca_controller_required_check_failed:verify:${recoveredVerify.conclusion || 'unknown'}`);
  }
  if (recoveredDeploy?.status === 'completed' && recoveredDeploy?.conclusion !== 'success') {
    throw new Error(`ca_controller_required_check_failed:deploy_frontend_production:${recoveredDeploy.conclusion || 'unknown'}`);
  }
  const pending = [];
  if (recoveredVerify?.status !== 'completed' || recoveredVerify?.conclusion !== 'success') pending.push('verify');
  if (recoveredDeploy?.status !== 'completed' || recoveredDeploy?.conclusion !== 'success') pending.push('deploy_frontend_production');
  return Object.freeze({
    ready: pending.length === 0,
    pending: Object.freeze(pending),
    check_runs: Object.freeze(recoveredRuns),
    deployment_sha: mainSha,
    recovery: true,
    recovered_from_merge_sha: sha,
    snapshot_blob_sha: currentSnapshotSha
  });
}

export { CA_SNAPSHOT_PATH, FRONTEND_DEPLOY_CHECKS };
