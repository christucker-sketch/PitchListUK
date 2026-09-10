import { shadowControllerDecision } from './controller-shadow-decision.mjs';
import { assertAuthoritativeUsMutationAllowed } from './controller-authority-guard.mjs';
import {
  assertGlobalControllerDispatchAllowed,
  resolveGlobalAcquisitionDispatch
} from './dispatch.mjs';

function stateStub(env) {
  const id = env.CONTROLLER_STATE.idFromName('us-controller');
  return env.CONTROLLER_STATE.get(id);
}

async function readSnapshot(stub) {
  const response = await stub.fetch('https://controller-state.internal/snapshot');
  if (!response.ok) throw new Error(`controller_state_read_http_${response.status}`);
  const text = await response.text();
  return {
    state: JSON.parse(text),
    text,
    version: Number(response.headers.get('x-findpitches-state-version') || 0),
    sha256: String(response.headers.get('x-findpitches-state-sha256') || ''),
    authority: String(response.headers.get('x-findpitches-state-authority') || 'unknown')
  };
}

export async function checkpointCloudControllerState(stub, snapshot, nextState) {
  const raw = `${JSON.stringify(nextState, null, 2)}\n`;
  const response = await stub.fetch(new Request('https://controller-state.internal/checkpoint', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'x-findpitches-expected-state-version': String(snapshot.version),
      'x-findpitches-expected-state-sha256': String(snapshot.sha256)
    },
    body: raw
  }));
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${body?.error || `controller_state_checkpoint_http_${response.status}`}`);
  return body;
}

function discoveryWorkflowId(snapshot, decision) {
  return `usctl-v${snapshot.version}-${decision.state_code.toLowerCase()}-q${decision.query_offset}-l${decision.query_limit}`;
}

function reservedDecision(state) {
  const intent = state?.cloud_controller_intent;
  if (!intent || intent.phase !== 'reserved' || intent.action !== 'trigger_discovery') return null;
  return {
    action: 'trigger_reserved_discovery',
    mode: 'discover',
    state_code: intent.state_code,
    state_name: intent.state_name,
    query_offset: intent.query_offset,
    query_limit: intent.query_limit,
    plan_size: intent.plan_size,
    next_priority_cursor: intent.next_priority_cursor,
    workflow_id: intent.workflow_id
  };
}

function decisionForState(state) {
  return reservedDecision(state) || shadowControllerDecision(state);
}

async function assertExecutionAllowed(env, decision) {
  const dispatch = resolveGlobalAcquisitionDispatch({
    country: 'US',
    mode: decision.mode || 'discover',
    state_code: decision.state_code,
    query_offset: decision.query_offset,
    query_limit: decision.query_limit,
    trigger: 'cloud-controller'
  });
  assertGlobalControllerDispatchAllowed(env, dispatch);
  await assertAuthoritativeUsMutationAllowed(env, dispatch);
  return dispatch;
}

async function reserveDiscovery(stub, snapshot, decision) {
  const nextState = structuredClone(snapshot.state);
  nextState.cloud_controller_intent = {
    phase: 'reserved',
    action: 'trigger_discovery',
    workflow_id: discoveryWorkflowId(snapshot, decision),
    mode: 'discover',
    state_code: decision.state_code,
    state_name: decision.state_name,
    query_offset: decision.query_offset,
    query_limit: decision.query_limit,
    plan_size: decision.plan_size,
    next_priority_cursor: decision.next_priority_cursor,
    reserved_from_version: snapshot.version,
    reserved_from_sha256: snapshot.sha256,
    reserved_at: new Date().toISOString()
  };
  nextState.updated_at = new Date().toISOString();
  const checkpoint = await checkpointCloudControllerState(stub, snapshot, nextState);
  return {
    ok: true,
    executed: true,
    phase: 'reserved',
    state_version: checkpoint.version,
    state_sha256: checkpoint.sha256,
    workflow_id: nextState.cloud_controller_intent.workflow_id,
    decision
  };
}

async function ensureReservedDiscoveryWorkflow(env, stub, snapshot, decision) {
  const dispatch = await assertExecutionAllowed(env, decision);
  const workflowId = decision.workflow_id;
  if (!workflowId) throw new Error('reserved_discovery_workflow_id_missing');

  await env.GLOBAL_ACQUISITION.createBatch([{ id: workflowId, params: dispatch.payload }]);
  const instance = await env.GLOBAL_ACQUISITION.get(workflowId);
  if (!instance || instance.id !== workflowId) throw new Error('reserved_discovery_workflow_lookup_failed');

  const nextState = structuredClone(snapshot.state);
  const intent = nextState.cloud_controller_intent;
  if (!intent || intent.workflow_id !== workflowId || intent.phase !== 'reserved') {
    throw new Error('reserved_discovery_intent_changed');
  }

  nextState.current = {
    mode: 'discover',
    state_code: intent.state_code,
    query_offset: intent.query_offset,
    query_limit: intent.query_limit,
    plan_size: intent.plan_size,
    next_priority_cursor: intent.next_priority_cursor
  };
  nextState.active_instance = {
    id: workflowId,
    mode: 'discover',
    state_code: intent.state_code,
    state_name: intent.state_name,
    worker_version: nextState.worker_version || '',
    worker_sha: nextState.worker_sha || '',
    started_at: new Date().toISOString()
  };
  nextState.status = 'running_cloudflare_discovery';
  delete nextState.cloud_controller_intent;
  nextState.updated_at = new Date().toISOString();

  const checkpoint = await checkpointCloudControllerState(stub, snapshot, nextState);
  return {
    ok: true,
    executed: true,
    phase: 'workflow_bound',
    state_version: checkpoint.version,
    state_sha256: checkpoint.sha256,
    workflow_id: workflowId,
    decision
  };
}

export async function runCloudControllerTick(env, options = {}) {
  const execute = options.execute === true;
  const stub = stateStub(env);
  const snapshot = await readSnapshot(stub);
  const decision = decisionForState(snapshot.state);

  if (!execute) {
    return {
      ok: true,
      executed: false,
      authority: snapshot.authority,
      state_version: snapshot.version,
      state_sha256: snapshot.sha256,
      decision
    };
  }

  if (snapshot.authority !== 'authoritative') throw new Error(`controller_state_not_authoritative:${snapshot.authority}`);

  await assertExecutionAllowed(env, decision);

  if (decision.action === 'trigger_discovery') return reserveDiscovery(stub, snapshot, decision);
  if (decision.action === 'trigger_reserved_discovery') return ensureReservedDiscoveryWorkflow(env, stub, snapshot, decision);

  throw new Error(`cloud_controller_action_not_implemented:${decision.action}`);
}
