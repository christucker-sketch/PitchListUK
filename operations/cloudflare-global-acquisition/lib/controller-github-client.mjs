const INTERNAL_URL = 'https://findpitches-github-controller.internal/controller-pr';
const INTERNAL_MARKER = 'findpitches-controller-service-v1';
const SOURCE_REGISTRY_PATH = 'operations/opportunity-pipeline/config/us-growth-source-registry.json';

async function brokerRequest(env, payload) {
  if (!env?.GITHUB_PR_BROKER) throw new Error('controller_github_broker_binding_missing');
  const response = await env.GITHUB_PR_BROKER.fetch(new Request(INTERNAL_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-findpitches-internal-service': INTERNAL_MARKER
    },
    body: JSON.stringify(payload)
  }));
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok !== true) throw new Error(body?.error || `controller_github_broker_http_${response.status}`);
  return body;
}

export async function inspectControllerPr(env, prNumber) {
  return (await brokerRequest(env, { action: 'inspect', pr_number: prNumber })).pr;
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
  const expectedIds = [...(Array.isArray(result?.publication?.source_ids) ? result.publication.source_ids : [])].sort();
  if (expectedCount < 1 || expectedIds.length !== expectedCount) throw new Error('source_pr_result_evidence_incomplete');
  if (Number(result?.generated_source_count) !== expectedCount || Number(result?.evidence_passed_count) !== expectedCount) throw new Error('source_pr_result_evidence_count_mismatch');

  const body = String(pr?.body || '');
  const stateName = String(result?.state_name || '').trim();
  const stateCode = String(result?.state_code || current.state_code || '').trim();
  for (const marker of [
    `- state: ${stateName} (${stateCode})`,
    `- net-new approved sources: ${expectedCount}`,
    `- deterministic source evidence receipts: ${expectedCount}/${expectedCount} passed`,
    '- additions only; no source removals',
    '- no automatic merge or deploy requested'
  ]) {
    if (!body.includes(marker)) throw new Error('source_pr_body_evidence_mismatch');
  }
  const normalizedBody = body.toLowerCase();
  for (const id of expectedIds) if (!normalizedBody.includes(`  - ${String(id).toLowerCase()}:`)) throw new Error(`source_pr_missing_evidence_receipt:${id}`);

  return Object.freeze({
    pr_number: expectedPr,
    head_sha: pr.head_sha,
    base_sha: pr.base_sha,
    state_code: stateCode,
    source_ids: expectedIds,
    source_count: expectedCount
  });
}

export { SOURCE_REGISTRY_PATH };
