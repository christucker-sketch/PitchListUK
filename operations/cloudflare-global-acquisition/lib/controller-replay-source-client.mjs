import { deferredUnitKey } from '../../cloudflare-texas-acquisition/scripts/growth-controller-integrity.mjs';
import { validateReplaySourceDeploymentProof } from './controller-replay-source-provenance.mjs';

const INTERNAL_URL = 'https://findpitches-github-controller.internal/controller-pr';
const INTERNAL_MARKER = 'findpitches-controller-service-v1';

export async function proveDeferredAcquisitionUnitSourcesDeployed(env, unit) {
  if (!unit || unit.mode !== 'acquire') throw new Error('replay_source_client_acquisition_unit_missing');
  if (!env?.GITHUB_PR_BROKER) throw new Error('controller_github_broker_binding_missing');
  const response = await env.GITHUB_PR_BROKER.fetch(new Request(INTERNAL_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-findpitches-internal-service': INTERNAL_MARKER
    },
    body: JSON.stringify({
      action: 'inspect_replay_source_provenance',
      state_code: unit.state_code,
      source_ids: [...(unit.source_ids || [])]
    })
  }));
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok !== true || !body?.provenance) {
    throw new Error(body?.error || `replay_source_provenance_http_${response.status}`);
  }
  const validated = validateReplaySourceDeploymentProof({ deferred_replay_inflight: unit }, body.provenance);
  const sourcePrNumber = Number(body.provenance.source_pr_number);
  if (!Number.isInteger(sourcePrNumber) || sourcePrNumber <= 0) throw new Error('replay_source_provenance_anchor_pr_invalid');
  return Object.freeze({
    ...validated,
    source_pr_number: sourcePrNumber,
    source_head_sha: String(body.provenance.source_head_sha || '').toLowerCase()
  });
}

export function enrichDeferredAcquisitionReplayUnit(state, unit, proof, now = new Date()) {
  const key = deferredUnitKey(unit);
  if (!key || unit?.mode !== 'acquire') throw new Error('replay_source_enrichment_unit_invalid');
  const nextState = structuredClone(state);
  const index = (Array.isArray(nextState.deferred_units) ? nextState.deferred_units : [])
    .findIndex(candidate => candidate?.disposition === 'deferred_for_replay' && deferredUnitKey(candidate) === key);
  if (index < 0) throw new Error('replay_source_enrichment_candidate_missing');
  const candidate = nextState.deferred_units[index];

  const expectedIds = [...(candidate.source_ids || [])].map(String).sort();
  const provenIds = [...(proof?.source_ids || [])].map(String).sort();
  if (!expectedIds.length || JSON.stringify(expectedIds) !== JSON.stringify(provenIds)) throw new Error('replay_source_enrichment_source_ids_mismatch');
  if (String(candidate.state_code || '').toUpperCase() !== String(proof?.state_code || '').toUpperCase()) throw new Error('replay_source_enrichment_state_mismatch');
  for (const [name, value] of [['main_sha', proof?.main_sha], ['registry_blob_sha', proof?.registry_blob_sha], ['deployment_anchor_sha', proof?.deployment_anchor_sha]]) {
    if (!/^[a-f0-9]{40}$/i.test(String(value || ''))) throw new Error(`replay_source_enrichment_${name}_invalid`);
  }
  const sourcePrNumber = Number(proof?.source_pr_number);
  const deploymentCheckId = Number(proof?.deployment_check_id);
  if (!Number.isInteger(sourcePrNumber) || sourcePrNumber <= 0) throw new Error('replay_source_enrichment_anchor_pr_invalid');
  if (!Number.isInteger(deploymentCheckId) || deploymentCheckId <= 0) throw new Error('replay_source_enrichment_deployment_check_invalid');

  candidate.source_pr = sourcePrNumber;
  candidate.replay_source_provenance = {
    state_code: String(proof.state_code).toUpperCase(),
    source_ids: provenIds,
    main_sha: String(proof.main_sha).toLowerCase(),
    registry_blob_sha: String(proof.registry_blob_sha).toLowerCase(),
    deployment_anchor_sha: String(proof.deployment_anchor_sha).toLowerCase(),
    deployment_check_id: deploymentCheckId,
    source_head_sha: String(proof.source_head_sha || '').toLowerCase(),
    proven_at: now.toISOString()
  };
  nextState.updated_at = now.toISOString();
  return Object.freeze({ next_state: nextState, key, source_pr_number: sourcePrNumber, proof: structuredClone(candidate.replay_source_provenance) });
}
