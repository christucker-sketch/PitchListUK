import { shadowControllerDecision } from './controller-shadow-decision.mjs';
import { assertAuthoritativeUsMutationAllowed } from './controller-authority-guard.mjs';
import {
  assertGlobalControllerDispatchAllowed,
  resolveGlobalAcquisitionDispatch
} from './dispatch.mjs';
import {
  inspectControllerPr,
  mergeControllerPr,
  validateSourcePrInspection
} from './controller-github-client.mjs';

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
  if (!intent || intent.phase !== 'reserved') return null;
  if (intent.action === 'trigger_discovery') {
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
  if (intent.action === 'merge_source_pr') {
    return {
      action: 'merge_reserved_source_pr',
      mode: 'discover',
      state_code: intent.state_code,
      pr_number: intent.pr_number,
      base_sha: intent.base_sha,
      head_sha: intent.head_sha,
      source_ids: [...(intent.source_ids || [])]
    };
  }
  throw new Error(`cloud_controller_reserved_intent_unsupported:${intent.action || 'unknown'}`);
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
  return { ok: true, executed: true, phase: 'reserved', state_version: checkpoint.version, state_sha256: checkpoint.sha256, workflow_id: nextState.cloud_controller_intent.workflow_id, decision };
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
  if (!intent || intent.workflow_id !== workflowId || intent.phase !== 'reserved') throw new Error('reserved_discovery_intent_changed');
  nextState.current = {
    mode: 'discover', state_code: intent.state_code, query_offset: intent.query_offset,
    query_limit: intent.query_limit, plan_size: intent.plan_size, next_priority_cursor: intent.next_priority_cursor
  };
  nextState.active_instance = {
    id: workflowId, mode: 'discover', state_code: intent.state_code, state_name: intent.state_name,
    worker_version: nextState.worker_version || '', worker_sha: nextState.worker_sha || '', started_at: new Date().toISOString()
  };
  nextState.status = 'running_cloudflare_discovery';
  delete nextState.cloud_controller_intent;
  nextState.updated_at = new Date().toISOString();
  const checkpoint = await checkpointCloudControllerState(stub, snapshot, nextState);
  return { ok: true, executed: true, phase: 'workflow_bound', state_version: checkpoint.version, state_sha256: checkpoint.sha256, workflow_id: workflowId, decision };
}

function normalizeWorkflowOutput(value) {
  let output = value;
  for (let depth = 0; depth < 2 && typeof output === 'string'; depth += 1) {
    try { output = JSON.parse(output); } catch { throw new Error('active_workflow_output_invalid_json'); }
  }
  if (!output || typeof output !== 'object' || Array.isArray(output)) throw new Error('active_workflow_output_invalid');
  return output;
}

function checkpointedResult(state, active, result) {
  const existing = Array.isArray(state.results) ? state.results.find(item => item?.instance_id === active.id) : null;
  if (existing) return existing;
  const completed = { ...result, instance_id: active.id, worker_version: active.worker_version, worker_sha: active.worker_sha };
  state.results = Array.isArray(state.results) ? state.results : [];
  state.results.push(completed);
  return completed;
}

async function inspectActiveWorkflow(env, stub, snapshot, decision) {
  const active = snapshot.state.active_instance;
  if (!active?.id || decision.instance_id !== active.id) throw new Error('active_workflow_checkpoint_mismatch');
  const instance = await env.GLOBAL_ACQUISITION.get(active.id);
  if (!instance || instance.id !== active.id || typeof instance.status !== 'function') throw new Error('active_workflow_lookup_failed');
  const details = await instance.status();
  const status = String(details?.status || 'unknown');
  if (['queued', 'running', 'waiting', 'waitingForPause'].includes(status)) {
    return { ok: true, executed: false, phase: 'workflow_observed', workflow_id: active.id, workflow_status: status, state_version: snapshot.version, state_sha256: snapshot.sha256, decision };
  }
  if (status !== 'complete') {
    const message = details?.error?.message ? `:${String(details.error.message)}` : '';
    throw new Error(`active_workflow_terminal_${status}${message}`);
  }
  if (active.mode !== 'discover') throw new Error(`active_workflow_completion_not_implemented:${active.mode || 'unknown'}`);
  const result = normalizeWorkflowOutput(details.output);
  if (result.state_code !== active.state_code) throw new Error('active_workflow_result_state_mismatch');
  if (!Number.isInteger(Number(result.next_query_offset))) throw new Error('active_workflow_result_next_query_offset_invalid');

  const nextState = structuredClone(snapshot.state);
  const current = nextState.current;
  if (!current || current.state_code !== active.state_code) throw new Error('active_workflow_current_checkpoint_mismatch');
  const completed = checkpointedResult(nextState, active, result);
  nextState.active_instance = null;
  nextState.query_offsets = { ...(nextState.query_offsets || {}), [active.state_code]: Number(completed.next_query_offset) };
  nextState.priority_cursor = Number(current.next_priority_cursor ?? nextState.priority_cursor ?? 0);
  const sourceCount = Number(completed.publication?.source_count || completed.publication?.source_ids?.length || 0);
  if (sourceCount > 0) {
    const prNumber = Number(completed.publication?.pr_number);
    if (!Number.isInteger(prNumber) || prNumber <= 0) throw new Error('active_workflow_source_pr_missing');
    nextState.current = { ...current, discovery_instance_id: active.id, source_pr: prNumber };
    nextState.status = 'reviewing_source_pr';
  } else {
    nextState.current = null;
    nextState.status = 'ready';
  }
  nextState.updated_at = new Date().toISOString();
  const checkpoint = await checkpointCloudControllerState(stub, snapshot, nextState);
  return { ok: true, executed: true, phase: 'workflow_completed', workflow_id: active.id, workflow_status: status, state_version: checkpoint.version, state_sha256: checkpoint.sha256, next_status: nextState.status, source_count: sourceCount, decision };
}

async function reserveSourcePrMerge(env, stub, snapshot, decision) {
  const pr = await inspectControllerPr(env, decision.pr_number);
  const validated = validateSourcePrInspection(snapshot.state, pr);
  const nextState = structuredClone(snapshot.state);
  nextState.cloud_controller_intent = {
    phase: 'reserved',
    action: 'merge_source_pr',
    pr_number: validated.pr_number,
    state_code: validated.state_code,
    base_sha: validated.base_sha,
    head_sha: validated.head_sha,
    source_ids: [...validated.source_ids],
    source_count: validated.source_count,
    reserved_from_version: snapshot.version,
    reserved_from_sha256: snapshot.sha256,
    reserved_at: new Date().toISOString()
  };
  nextState.updated_at = new Date().toISOString();
  const checkpoint = await checkpointCloudControllerState(stub, snapshot, nextState);
  return {
    ok: true, executed: true, phase: 'source_pr_merge_reserved', pr_number: validated.pr_number,
    state_version: checkpoint.version, state_sha256: checkpoint.sha256, source_ids: validated.source_ids, decision
  };
}

async function mergeReservedSourcePr(env, stub, snapshot, decision) {
  const intent = snapshot.state?.cloud_controller_intent;
  if (!intent || intent.phase !== 'reserved' || intent.action !== 'merge_source_pr') throw new Error('reserved_source_pr_intent_missing');
  if (Number(intent.pr_number) !== Number(decision.pr_number) || intent.base_sha !== decision.base_sha || intent.head_sha !== decision.head_sha) {
    throw new Error('reserved_source_pr_intent_changed');
  }
  const merged = await mergeControllerPr(env, {
    pr_number: intent.pr_number,
    base_sha: intent.base_sha,
    head_sha: intent.head_sha
  });
  const nextState = structuredClone(snapshot.state);
  nextState.pending_source_ids = [...(intent.source_ids || [])].sort();
  nextState.acquisition_batch = 1;
  nextState.status = 'ready_acquisition';
  delete nextState.cloud_controller_intent;
  nextState.updated_at = new Date().toISOString();
  const checkpoint = await checkpointCloudControllerState(stub, snapshot, nextState);
  return {
    ok: true, executed: true, phase: 'source_pr_merged', pr_number: Number(intent.pr_number),
    merge_sha: merged.merge_sha, merge_reused: merged.reused === true,
    state_version: checkpoint.version, state_sha256: checkpoint.sha256,
    next_status: nextState.status, source_ids: nextState.pending_source_ids, decision
  };
}

export async function runCloudControllerTick(env, options = {}) {
  const execute = options.execute === true;
  const stub = stateStub(env);
  const snapshot = await readSnapshot(stub);
  const decision = decisionForState(snapshot.state);
  if (!execute) return { ok: true, executed: false, authority: snapshot.authority, state_version: snapshot.version, state_sha256: snapshot.sha256, decision };
  if (snapshot.authority !== 'authoritative') throw new Error(`controller_state_not_authoritative:${snapshot.authority}`);
  await assertExecutionAllowed(env, decision);
  if (decision.action === 'trigger_discovery') return reserveDiscovery(stub, snapshot, decision);
  if (decision.action === 'trigger_reserved_discovery') return ensureReservedDiscoveryWorkflow(env, stub, snapshot, decision);
  if (decision.action === 'inspect_active_workflow') return inspectActiveWorkflow(env, stub, snapshot, decision);
  if (decision.action === 'review_source_pr') return reserveSourcePrMerge(env, stub, snapshot, decision);
  if (decision.action === 'merge_reserved_source_pr') return mergeReservedSourcePr(env, stub, snapshot, decision);
  throw new Error(`cloud_controller_action_not_implemented:${decision.action}`);
}
