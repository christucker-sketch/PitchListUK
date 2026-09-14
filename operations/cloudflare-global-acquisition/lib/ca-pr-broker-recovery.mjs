import { globalCaControllerCutoverEnabled } from './ca-cloud-controller.mjs';

export const CA_PR_BROKER_RECOVERY_MODE = 'recover_failed_ca_pr_broker_workflow';
const RECOVERABLE_ERROR = 'internal_github_pr_head_rejected';
const ACTIVE_STATUSES = new Set(['queued', 'running', 'waiting', 'waitingForPause']);

function stateStub(env) {
  if (!env?.CA_CONTROLLER_STATE) throw new Error('ca_controller_state_binding_missing');
  return env.CA_CONTROLLER_STATE.get(env.CA_CONTROLLER_STATE.idFromName('ca-controller'));
}

async function readSnapshot(stub) {
  const response = await stub.fetch('https://ca-controller-state.internal/snapshot');
  if (!response.ok) throw new Error(`ca_pr_broker_recovery_snapshot_http_${response.status}`);
  return {
    state: JSON.parse(await response.text()),
    version: Number(response.headers.get('x-findpitches-state-version') || 0),
    sha256: String(response.headers.get('x-findpitches-state-sha256') || ''),
    authority: String(response.headers.get('x-findpitches-state-authority') || 'unknown')
  };
}

async function checkpoint(stub, snapshot, nextState) {
  const response = await stub.fetch(new Request('https://ca-controller-state.internal/checkpoint', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'x-findpitches-expected-state-version': String(snapshot.version),
      'x-findpitches-expected-state-sha256': String(snapshot.sha256)
    },
    body: `${JSON.stringify(nextState, null, 2)}\n`
  }));
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `ca_pr_broker_recovery_checkpoint_http_${response.status}`);
  return body;
}

export function isRecoverableCaPrBrokerFailure(details = {}) {
  const status = String(details?.status || 'unknown');
  const message = String(details?.error?.message || details?.error || '');
  return ['errored', 'terminated'].includes(status) && message.includes(RECOVERABLE_ERROR);
}

export async function recoverFailedCanadaPrBrokerWorkflow(env) {
  if (!globalCaControllerCutoverEnabled(env)) throw new Error('ca_pr_broker_recovery_cutover_disabled');
  const stub = stateStub(env);
  const snapshot = await readSnapshot(stub);
  if (snapshot.authority !== 'authoritative') throw new Error(`ca_pr_broker_recovery_authority_${snapshot.authority}`);
  if (snapshot.state?.controller_kind !== 'ca') throw new Error('ca_pr_broker_recovery_state_invalid');

  const active = snapshot.state.active_instance;
  if (!active?.id) {
    return Object.freeze({
      ok: true,
      recovered: false,
      already_progressed: true,
      pending: false,
      authority: snapshot.authority,
      cutover_enabled: true,
      state_status: String(snapshot.state.status || 'unknown'),
      state_version: snapshot.version,
      state_sha256: snapshot.sha256
    });
  }
  if (!['discovery', 'acquisition'].includes(active.mode)) throw new Error('ca_pr_broker_recovery_active_mode_invalid');
  if (snapshot.state.cloud_controller_intent || snapshot.state.pending_source_pr || snapshot.state.pending_data_pr || snapshot.state.pending_deployment) {
    throw new Error('ca_pr_broker_recovery_checkpoint_not_isolated');
  }

  const expectedStatus = active.mode === 'discovery' ? 'running_discovery' : 'running_acquisition';
  if (snapshot.state.status !== expectedStatus) throw new Error(`ca_pr_broker_recovery_status_mismatch:${snapshot.state.status}`);
  if (!env?.GLOBAL_ACQUISITION?.get) throw new Error('ca_pr_broker_recovery_workflow_binding_missing');
  const instance = await env.GLOBAL_ACQUISITION.get(active.id);
  if (!instance || typeof instance.status !== 'function') throw new Error('ca_pr_broker_recovery_workflow_lookup_failed');
  const details = await instance.status();
  const workflowStatus = String(details?.status || 'unknown');

  if (ACTIVE_STATUSES.has(workflowStatus) || workflowStatus === 'complete') {
    return Object.freeze({
      ok: true,
      recovered: false,
      already_progressed: false,
      pending: true,
      workflow_id: active.id,
      workflow_mode: active.mode,
      workflow_status: workflowStatus,
      authority: snapshot.authority,
      cutover_enabled: true,
      state_status: snapshot.state.status,
      state_version: snapshot.version,
      state_sha256: snapshot.sha256
    });
  }

  if (!isRecoverableCaPrBrokerFailure(details)) {
    throw new Error(`ca_pr_broker_recovery_terminal_unmatched:${workflowStatus}:${String(details?.error?.message || details?.error || '')}`);
  }

  const next = structuredClone(snapshot.state);
  next.active_instance = null;
  next.status = active.mode === 'discovery' ? 'ready_discovery' : 'ready_acquisition';
  next.updated_at = new Date().toISOString();
  const written = await checkpoint(stub, snapshot, next);
  return Object.freeze({
    ok: true,
    recovered: true,
    already_progressed: false,
    pending: false,
    recovery: 'github_pr_broker_head_policy',
    workflow_id: active.id,
    workflow_mode: active.mode,
    workflow_status: workflowStatus,
    terminal_error: String(details?.error?.message || details?.error || ''),
    authority: snapshot.authority,
    cutover_enabled: true,
    previous_status: snapshot.state.status,
    state_status: next.status,
    previous_state_version: snapshot.version,
    state_version: Number(written.version || 0),
    state_sha256: String(written.sha256 || '')
  });
}

export { RECOVERABLE_ERROR as CA_PR_BROKER_RECOVERABLE_ERROR };
