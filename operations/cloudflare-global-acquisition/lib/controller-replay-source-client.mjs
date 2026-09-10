import { validateReplaySourceDeploymentProof } from './controller-replay-source-provenance.mjs';

const INTERNAL_URL = 'https://findpitches-github-controller.internal/controller-pr';
const INTERNAL_MARKER = 'findpitches-controller-service-v1';

export async function proveDeferredAcquisitionSourcesDeployed(env, state) {
  const inflight = state?.deferred_replay_inflight;
  if (!inflight || inflight.mode !== 'acquire') throw new Error('replay_source_client_inflight_acquisition_missing');
  if (!env?.GITHUB_PR_BROKER) throw new Error('controller_github_broker_binding_missing');

  const response = await env.GITHUB_PR_BROKER.fetch(new Request(INTERNAL_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-findpitches-internal-service': INTERNAL_MARKER
    },
    body: JSON.stringify({
      action: 'inspect_replay_source_provenance',
      state_code: inflight.state_code,
      source_ids: [...(inflight.source_ids || [])]
    })
  }));
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok !== true || !body?.provenance) {
    throw new Error(body?.error || `replay_source_provenance_http_${response.status}`);
  }
  const validated = validateReplaySourceDeploymentProof(state, body.provenance);
  const sourcePrNumber = Number(body.provenance.source_pr_number);
  if (!Number.isInteger(sourcePrNumber) || sourcePrNumber <= 0) throw new Error('replay_source_provenance_anchor_pr_invalid');
  return Object.freeze({
    ...validated,
    source_pr_number: sourcePrNumber,
    source_head_sha: String(body.provenance.source_head_sha || '').toLowerCase()
  });
}

export function bindDeferredAcquisitionDeploymentProof(state, proof, now = new Date()) {
  const nextState = structuredClone(state);
  const inflight = nextState.deferred_replay_inflight;
  if (!inflight || inflight.mode !== 'acquire') throw new Error('replay_source_bind_inflight_acquisition_missing');
  if (!proof || String(proof.state_code || '').toUpperCase() !== String(inflight.state_code || '').toUpperCase()) throw new Error('replay_source_bind_state_mismatch');

  nextState.current = {
    ...(nextState.current || {}),
    source_pr: Number(proof.source_pr_number),
    replay_source_provenance: {
      registry_blob_sha: proof.registry_blob_sha,
      deployment_anchor_sha: proof.deployment_anchor_sha,
      deployment_check_id: proof.deployment_check_id,
      main_sha: proof.main_sha,
      source_ids: [...proof.source_ids],
      proven_at: now.toISOString()
    }
  };
  nextState.updated_at = now.toISOString();
  return nextState;
}
