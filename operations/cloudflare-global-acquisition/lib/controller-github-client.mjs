const INTERNAL_URL = 'https://findpitches-github-controller.internal/controller-pr';
const INTERNAL_MARKER = 'findpitches-controller-service-v1';
const SOURCE_REGISTRY_PATH = 'operations/opportunity-pipeline/config/us-growth-source-registry.json';
const US_SNAPSHOT_PATH = 'functions/_data/us-opportunities.mjs';

async function brokerRequest(env, payload) {
  if (!env?.GITHUB_PR_BROKER) throw new Error('controller_github_broker_binding_missing');
  const response = await env.GITHUB_PR_BROKER.fetch(new Request(INTERNAL_URL, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-findpitches-internal-service': INTERNAL_MARKER }, body: JSON.stringify(payload)
  }));
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok !== true) throw new Error(body?.error || `controller_github_broker_http_${response.status}`);
  return body;
}

export async function inspectControllerPr(env, prNumber) {
  return (await brokerRequest(env, { action: 'inspect', pr_number: prNumber })).pr;
}

export async function inspectSourceMergeChecks(env, prNumber) {
  return (await brokerRequest(env, { action: 'inspect_merge_checks', pr_number: prNumber })).deployment;
}

export async function inspectDataMergeChecks(env, prNumber) {
  return (await brokerRequest(env, { action: 'inspect_data_merge_checks', pr_number: prNumber })).deployment;
}

export function classifyAcquisitionWorkerDeployment(deployment) {
  const mergeSha = String(deployment?.merge_sha || '').toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(mergeSha)) throw new Error('source_merge_deployment_sha_invalid');
  const runs = Array.isArray(deployment?.check_runs) ? deployment.check_runs : [];
  const verify = runs.find(run => String(run?.name || '') === 'verify');
  const deploy = runs.find(run => String(run?.name || '') === 'deploy_acquisition_worker_production');
  for (const [name, run] of [['verify', verify], ['deploy_acquisition_worker_production', deploy]]) {
    if (!run || run.status !== 'completed') return { ready: false, status: 'pending', merge_sha: mergeSha, waiting_for: name };
    if (run.conclusion !== 'success') throw new Error(`source_merge_required_check_failed:${name}:${run.conclusion || 'unknown'}`);
  }
  return { ready: true, status: 'passed', merge_sha: mergeSha };
}

function newestCheck(runs, name) {
  return runs
    .filter(run => String(run?.name || '') === name)
    .sort((left, right) => Number(right?.id || 0) - Number(left?.id || 0))[0] || null;
}

export function classifyFrontendProductionDeployment(deployment) {
  const mergeSha = String(deployment?.merge_sha || '').toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(mergeSha)) throw new Error('data_merge_deployment_sha_invalid');
  const runs = Array.isArray(deployment?.check_runs) ? deployment.check_runs : [];
  const verify = newestCheck(runs, 'verify');
  const deploy = newestCheck(runs, 'deploy_frontend_production');
  for (const [name, run] of [['verify', verify], ['deploy_frontend_production', deploy]]) {
    if (!run || run.status !== 'completed') return { ready: false, status: 'pending', merge_sha: mergeSha, waiting_for: name };
    if (run.conclusion !== 'success') throw new Error(`data_merge_required_check_failed:${name}:${run.conclusion || 'unknown'}`);
  }
  const deploymentCheckId = Number(deploy.id);
  if (!Number.isInteger(deploymentCheckId) || deploymentCheckId <= 0) throw new Error('data_merge_deployment_check_id_invalid');
  return { ready: true, status: 'passed', merge_sha: mergeSha, deployment_check_id: deploymentCheckId };
}

export async function mergeControllerPr(env, inspection) {
  const prNumber = Number(inspection?.pr_number);
  const headSha = String(inspection?.head_sha || '').toLowerCase();
  const baseSha = String(inspection?.base_sha || '').toLowerCase();
  if (!Number.isInteger(prNumber) || prNumber <= 0) throw new Error('controller_merge_pr_number_invalid');
  if (!/^[a-f0-9]{40}$/.test(headSha) || !/^[a-f0-9]{40}$/.test(baseSha)) throw new Error('controller_merge_sha_invalid');
  const result = await brokerRequest(env, { action: 'merge', pr_number: prNumber, expected_head_sha: headSha, expected_base_sha: baseSha });
  if (result?.merged !== true || Number(result?.pr_number) !== prNumber || !/^[a-f0-9]{40}$/i.test(String(result?.merge_sha || ''))) throw new Error('controller_merge_not_confirmed');
  return result;
}

function successfulChecks(checkRuns) {
  const runs = Array.isArray(checkRuns) ? checkRuns : [];
  if (!runs.length) return false;
  return runs.every(run => run?.status === 'completed' && ['success', 'neutral', 'skipped'].includes(String(run?.conclusion || '')));
}

function resultForDiscovery(state) {
  const instanceId = state?.current?.discovery_instance_id;
  if (!instanceId) throw new Error('source_pr_discovery_instance_missing');
  const result = (Array.isArray(state?.results) ? state.results : []).find(item => item?.instance_id === instanceId);
  if (!result) throw new Error('source_pr_checkpointed_result_missing');
  return result;
}

function resultForAcquisition(state) {
  const instanceId = state?.current?.acquisition_instance_id;
  if (!instanceId) throw new Error('data_pr_acquisition_instance_missing');
  const result = (Array.isArray(state?.results) ? state.results : []).find(item => item?.instance_id === instanceId);
  if (!result) throw new Error('data_pr_checkpointed_result_missing');
  return result;
}

function requireExactRegistryProof(pr, expectedIds, expectedCount) {
  const proof = pr?.source_registry_proof;
  if (!proof || proof.additions_only !== true) throw new Error('source_pr_registry_additions_only_proof_missing');
  const addedIds = [...(Array.isArray(proof.added_ids) ? proof.added_ids : [])].map(String).sort();
  if (Number(proof.added_count) !== expectedCount || addedIds.length !== expectedCount) throw new Error('source_pr_registry_added_count_mismatch');
  if (JSON.stringify(addedIds) !== JSON.stringify(expectedIds)) throw new Error('source_pr_registry_added_ids_mismatch');
  const baseCount = Number(proof.base_count);
  const headCount = Number(proof.head_count);
  if (!Number.isInteger(baseCount) || baseCount < 0 || headCount !== baseCount + expectedCount) throw new Error('source_pr_registry_count_delta_invalid');
  return { added_ids: addedIds, base_count: baseCount, head_count: headCount };
}

function requireExactSnapshotProof(pr, result) {
  const before = Number(result?.before);
  const after = Number(result?.after);
  const additions = Number(result?.additions);
  if (!Number.isInteger(before) || before < 0 || !Number.isInteger(after) || !Number.isInteger(additions) || additions < 1 || after !== before + additions) {
    throw new Error('data_pr_result_count_delta_invalid');
  }
  const proof = pr?.data_snapshot_proof;
  if (!proof || proof.additions_only !== true) throw new Error('data_pr_snapshot_additions_only_proof_missing');
  if (Number(proof.base_count) !== before || Number(proof.head_count) !== after || Number(proof.added_count) !== additions) {
    throw new Error('data_pr_snapshot_count_mismatch');
  }
  const addedIds = [...(Array.isArray(proof.added_ids) ? proof.added_ids : [])].map(value => String(value).trim()).sort();
  if (addedIds.length !== additions || addedIds.some(id => !id) || new Set(addedIds).size !== additions) {
    throw new Error('data_pr_snapshot_added_ids_invalid');
  }
  return { before, after, additions, added_ids: addedIds };
}

export function validateSourcePrInspection(state, pr) {
  const current = state?.current;
  if (!current || state?.status !== 'reviewing_source_pr') throw new Error('source_pr_controller_state_invalid');
  const expectedPr = Number(current.source_pr);
  if (!Number.isInteger(expectedPr) || expectedPr <= 0 || Number(pr?.number) !== expectedPr) throw new Error('source_pr_number_mismatch');
  if (pr?.state !== 'OPEN' || pr?.merged || pr?.draft) throw new Error('source_pr_not_open_candidate');
  if (pr?.base_ref !== 'main') throw new Error('source_pr_base_not_main');
  if (!String(pr?.head_ref || '').startsWith('sources/cloud-us-')) throw new Error('source_pr_head_invalid');
  if (!/^[a-f0-9]{40}$/i.test(String(pr?.base_sha || '')) || !/^[a-f0-9]{40}$/i.test(String(pr?.head_sha || ''))) throw new Error('source_pr_sha_invalid');
  if (!Array.isArray(pr?.commits) || pr.commits.length !== 1 || pr.commits[0]?.sha !== pr.head_sha) throw new Error('source_pr_commit_shape_invalid');
  if (!Array.isArray(pr.commits[0]?.parents) || pr.commits[0].parents.length !== 1 || pr.commits[0].parents[0] !== pr.base_sha) throw new Error('source_pr_parent_not_exact_base');
  if (!Array.isArray(pr?.files) || pr.files.length !== 1 || pr.files[0]?.path !== SOURCE_REGISTRY_PATH) throw new Error('source_pr_file_scope_invalid');
  if (!successfulChecks(pr?.check_runs)) throw new Error('source_pr_checks_not_successful');
  const result = resultForDiscovery(state);
  const expectedCount = Number(result?.publication?.source_count || result?.publication?.source_ids?.length || 0);
  const expectedIds = [...(Array.isArray(result?.publication?.source_ids) ? result.publication.source_ids : [])].map(String).sort();
  if (expectedCount < 1 || expectedIds.length !== expectedCount) throw new Error('source_pr_result_evidence_incomplete');
  if (Number(result?.generated_source_count) !== expectedCount || Number(result?.evidence_passed_count) !== expectedCount) throw new Error('source_pr_result_evidence_count_mismatch');
  const body = String(pr?.body || '');
  const stateName = String(result?.state_name || '').trim();
  const stateCode = String(result?.state_code || current.state_code || '').trim();
  for (const marker of [`- state: ${stateName} (${stateCode})`, `- net-new approved sources: ${expectedCount}`, `- deterministic source evidence receipts: ${expectedCount}/${expectedCount} passed`, '- additions only; no source removals', '- no automatic merge or deploy requested']) if (!body.includes(marker)) throw new Error('source_pr_body_evidence_mismatch');
  const normalizedBody = body.toLowerCase();
  for (const id of expectedIds) if (!normalizedBody.includes(`  - ${String(id).toLowerCase()}:`)) throw new Error(`source_pr_missing_evidence_receipt:${id}`);
  const registryProof = requireExactRegistryProof(pr, expectedIds, expectedCount);
  return Object.freeze({ pr_number: expectedPr, head_sha: pr.head_sha, base_sha: pr.base_sha, state_code: stateCode, source_ids: expectedIds, source_count: expectedCount, registry_base_count: registryProof.base_count, registry_head_count: registryProof.head_count });
}

export function validateDataPrInspection(state, pr) {
  const current = state?.current;
  if (!current || state?.status !== 'reviewing_data_pr') throw new Error('data_pr_controller_state_invalid');
  const expectedPr = Number(current.data_pr);
  if (!Number.isInteger(expectedPr) || expectedPr <= 0 || Number(pr?.number) !== expectedPr) throw new Error('data_pr_number_mismatch');
  if (pr?.state !== 'OPEN' || pr?.merged || pr?.draft) throw new Error('data_pr_not_open_candidate');
  if (pr?.base_ref !== 'main') throw new Error('data_pr_base_not_main');
  const headRef = String(pr?.head_ref || '');
  if (!/^data\/cloud-[a-z0-9-]+-growth-[a-f0-9]{16}-base-[a-f0-9]{16}$/.test(headRef)) throw new Error('data_pr_head_invalid');
  if (!/^[a-f0-9]{40}$/i.test(String(pr?.base_sha || '')) || !/^[a-f0-9]{40}$/i.test(String(pr?.head_sha || ''))) throw new Error('data_pr_sha_invalid');
  if (!Array.isArray(pr?.commits) || pr.commits.length !== 1 || pr.commits[0]?.sha !== pr.head_sha) throw new Error('data_pr_commit_shape_invalid');
  if (!Array.isArray(pr.commits[0]?.parents) || pr.commits[0].parents.length !== 1 || pr.commits[0].parents[0] !== pr.base_sha) throw new Error('data_pr_parent_not_exact_base');
  if (!Array.isArray(pr?.files) || pr.files.length !== 1 || pr.files[0]?.path !== US_SNAPSHOT_PATH) throw new Error('data_pr_file_scope_invalid');
  if (!successfulChecks(pr?.check_runs)) throw new Error('data_pr_checks_not_successful');

  const result = resultForAcquisition(state);
  const stateCode = String(result?.state_code || '').trim().toUpperCase();
  const currentStateCode = String(current.state_code || '').trim().toUpperCase();
  const stateName = String(result?.state_name || '').trim();
  if (!stateCode || stateCode !== currentStateCode) throw new Error('data_pr_result_state_mismatch');
  if (Number(result?.publication?.pr_number) !== expectedPr) throw new Error('data_pr_result_pr_mismatch');
  const expectedBranch = String(result?.publication?.branch || '');
  if (!expectedBranch || headRef !== expectedBranch) throw new Error('data_pr_result_branch_mismatch');
  const promotionSha = String(result?.promotion_rows_sha256 || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(promotionSha)) throw new Error('data_pr_promotion_sha_invalid');
  if (!headRef.includes(`-growth-${promotionSha.slice(0, 16)}-base-${String(pr.base_sha).slice(0, 16).toLowerCase()}`)) throw new Error('data_pr_branch_provenance_mismatch');

  const staged = Number(result?.staged_count);
  const evidence = Number(result?.evidence_passed_count);
  const proof = requireExactSnapshotProof(pr, result);
  if (!Number.isInteger(staged) || staged < proof.additions || !Number.isInteger(evidence) || evidence !== staged) throw new Error('data_pr_result_evidence_count_mismatch');

  const body = String(pr?.body || '');
  for (const marker of [
    `- state: ${stateName} (${stateCode})`,
    `- production snapshot: ${proof.before} -> ${proof.after}`,
    `- net-new additions: ${proof.additions}`,
    `- promotion rows SHA256: ${promotionSha}`,
    `- deterministic evidence receipts: ${evidence}/${staged} passed`,
    '- no automatic merge or deploy requested'
  ]) if (!body.includes(marker)) throw new Error('data_pr_body_evidence_mismatch');

  return Object.freeze({
    pr_number: expectedPr,
    head_sha: String(pr.head_sha).toLowerCase(),
    base_sha: String(pr.base_sha).toLowerCase(),
    state_code: stateCode,
    before: proof.before,
    after: proof.after,
    additions: proof.additions,
    opportunity_ids: proof.added_ids
  });
}

export { SOURCE_REGISTRY_PATH, US_SNAPSHOT_PATH };
