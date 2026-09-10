import { shadowControllerDecision } from './controller-shadow-decision.mjs';
import { assertAuthoritativeUsMutationAllowed } from './controller-authority-guard.mjs';
import { applyAcquisitionWorkflowCompletion } from './controller-acquisition-completion.mjs';
import {
  assertGlobalControllerDispatchAllowed,
  resolveGlobalAcquisitionDispatch
} from './dispatch.mjs';
import {
  classifyAcquisitionWorkerDeployment,
  classifyFrontendProductionDeployment,
  inspectControllerPr,
  inspectDataMergeChecks,
  inspectSourceMergeChecks,
  mergeControllerPr,
  validateDataPrInspection,
  validateSourcePrInspection
} from './controller-github-client.mjs';
import {
  beginCloudLiveConsistency,
  validatePendingProductionDeployment
} from './controller-production-deployment.mjs';
import {
  classifyCloudLiveConsistency,
  finishCloudLiveConsistency,
  readLiveUsOpportunityConsistency,
  recordCloudLiveConsistencyTransientFailure,
  recordCloudLiveConsistencyWait
} from './controller-live-consistency.mjs';
import {
  quarantineCloudDeferredReplayExhausted,
  resolveCloudDeferredReplay,
  scheduleCloudDeferredReplay
} from './controller-deferred-replay.mjs';
import {
  blockCloudController,
  completeCloudController,
  markCloudControllerSweepComplete
} from './controller-terminal-lifecycle.mjs';
import { getStateConfig } from '../../cloudflare-texas-acquisition/src/us-state-registry.js';

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

function acquisitionWorkflowId(snapshot, decision) {
  return `usctl-v${snapshot.version}-${decision.state_code.toLowerCase()}-b${decision.batch_number}-acquire`;
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
  if (intent.action === 'trigger_acquisition') {
    return {
      action: 'trigger_reserved_acquisition',
      mode: 'acquire',
      state_code: intent.state_code,
      state_name: intent.state_name,
      source_ids: [...(intent.source_ids || [])],
      batch_number: Number(intent.batch_number || 1),
      workflow_id: intent.workflow_id,
      source_merge_sha: intent.source_merge_sha || null
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
  if (intent.action === 'merge_data_pr') {
    return {
      action: 'merge_reserved_data_pr',
      mode: 'acquire',
      state_code: intent.state_code,
      pr_number: intent.pr_number,
      base_sha: intent.base_sha,
      head_sha: intent.head_sha,
      before: intent.before,
      after: intent.after,
      additions: intent.additions,
      opportunity_ids: [...(intent.opportunity_ids || [])]
    };
  }
  throw new Error(`cloud_controller_reserved_intent_unsupported:${intent.action || 'unknown'}`);
}

function deferredReplayMaximumAttempts(env) {
  const raw = env?.GLOBAL_CONTROLLER_DEFERRED_REPLAY_ATTEMPTS;
  if (raw === undefined || raw === null || String(raw).trim() === '') return 3;
  const maximum = Number(raw);
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > 20) throw new Error('deferred_replay_maximum_attempts_invalid');
  return maximum;
}

function decisionForState(state, env) {
  return reservedDecision(state) || shadowControllerDecision(state, {
    maximumReplayAttempts: deferredReplayMaximumAttempts(env)
  });
}

function executionMode(decision) {
  if (decision?.mode) return decision.mode;
  return ['trigger_acquisition_or_advance_batch', 'trigger_reserved_acquisition', 'review_data_pr', 'merge_reserved_data_pr', 'verify_or_deploy_production', 'verify_live_consistency'].includes(decision?.action) ? 'acquire' : 'discover';
}

async function assertExecutionAllowed(env, decision) {
  const dispatch = resolveGlobalAcquisitionDispatch({
    country: 'US',
    mode: executionMode(decision),
    state_code: decision.state_code,
    query_offset: decision.query_offset,
    query_limit: decision.query_limit,
    source_ids: Array.isArray(decision.source_ids) ? [...decision.source_ids] : undefined,
    batch_number: decision.batch_number,
    trigger: 'cloud-controller'
  });
  assertGlobalControllerDispatchAllowed(env, dispatch);
  await assertAuthoritativeUsMutationAllowed(env, dispatch);
  return dispatch;
}

async function reserveDiscovery(stub, snapshot, decision) {
  const nextState = structuredClone(snapshot.state);
  nextState.cloud_controller_intent = {
    phase: 'reserved', action: 'trigger_discovery', workflow_id: discoveryWorkflowId(snapshot, decision),
    mode: 'discover', state_code: decision.state_code, state_name: decision.state_name,
    query_offset: decision.query_offset, query_limit: decision.query_limit, plan_size: decision.plan_size,
    next_priority_cursor: decision.next_priority_cursor, reserved_from_version: snapshot.version,
    reserved_from_sha256: snapshot.sha256, reserved_at: new Date().toISOString()
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
  const result = normalizeWorkflowOutput(details.output);
  if (result.state_code !== active.state_code) throw new Error('active_workflow_result_state_mismatch');

  if (active.mode === 'acquire') {
    const transition = applyAcquisitionWorkflowCompletion(snapshot.state, active, result);
    const checkpoint = await checkpointCloudControllerState(stub, snapshot, transition.next_state);
    return {
      ok: true, executed: true, phase: 'acquisition_workflow_completed', workflow_id: active.id,
      workflow_status: status, state_version: checkpoint.version, state_sha256: checkpoint.sha256,
      next_status: transition.next_status, additions: transition.additions, before: transition.before,
      after: transition.after, data_pr: transition.data_pr, next_batch: transition.next_batch, decision
    };
  }

  if (active.mode !== 'discover') throw new Error(`active_workflow_completion_not_implemented:${active.mode || 'unknown'}`);
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
    phase: 'reserved', action: 'merge_source_pr', pr_number: validated.pr_number, state_code: validated.state_code,
    base_sha: validated.base_sha, head_sha: validated.head_sha, source_ids: [...validated.source_ids],
    source_count: validated.source_count, reserved_from_version: snapshot.version,
    reserved_from_sha256: snapshot.sha256, reserved_at: new Date().toISOString()
  };
  nextState.updated_at = new Date().toISOString();
  const checkpoint = await checkpointCloudControllerState(stub, snapshot, nextState);
  return { ok: true, executed: true, phase: 'source_pr_merge_reserved', pr_number: validated.pr_number, state_version: checkpoint.version, state_sha256: checkpoint.sha256, source_ids: validated.source_ids, decision };
}

async function mergeReservedSourcePr(env, stub, snapshot, decision) {
  const intent = snapshot.state?.cloud_controller_intent;
  if (!intent || intent.phase !== 'reserved' || intent.action !== 'merge_source_pr') throw new Error('reserved_source_pr_intent_missing');
  if (Number(intent.pr_number) !== Number(decision.pr_number) || intent.base_sha !== decision.base_sha || intent.head_sha !== decision.head_sha) throw new Error('reserved_source_pr_intent_changed');
  const merged = await mergeControllerPr(env, { pr_number: intent.pr_number, base_sha: intent.base_sha, head_sha: intent.head_sha });
  const nextState = structuredClone(snapshot.state);
  nextState.pending_source_ids = [...(intent.source_ids || [])].sort();
  nextState.acquisition_batch = 1;
  nextState.status = 'ready_acquisition';
  delete nextState.cloud_controller_intent;
  nextState.updated_at = new Date().toISOString();
  const checkpoint = await checkpointCloudControllerState(stub, snapshot, nextState);
  return { ok: true, executed: true, phase: 'source_pr_merged', pr_number: Number(intent.pr_number), merge_sha: merged.merge_sha, merge_reused: merged.reused === true, state_version: checkpoint.version, state_sha256: checkpoint.sha256, next_status: nextState.status, source_ids: nextState.pending_source_ids, decision };
}

async function reserveDataPrMerge(env, stub, snapshot, decision) {
  const pr = await inspectControllerPr(env, decision.pr_number);
  const validated = validateDataPrInspection(snapshot.state, pr);
  const nextState = structuredClone(snapshot.state);
  nextState.cloud_controller_intent = {
    phase: 'reserved', action: 'merge_data_pr', pr_number: validated.pr_number, state_code: validated.state_code,
    base_sha: validated.base_sha, head_sha: validated.head_sha,
    before: validated.before, after: validated.after, additions: validated.additions,
    opportunity_ids: [...validated.opportunity_ids], reserved_from_version: snapshot.version,
    reserved_from_sha256: snapshot.sha256, reserved_at: new Date().toISOString()
  };
  nextState.updated_at = new Date().toISOString();
  const checkpoint = await checkpointCloudControllerState(stub, snapshot, nextState);
  return {
    ok: true, executed: true, phase: 'data_pr_merge_reserved', pr_number: validated.pr_number,
    state_version: checkpoint.version, state_sha256: checkpoint.sha256,
    before: validated.before, after: validated.after, additions: validated.additions,
    opportunity_ids: validated.opportunity_ids, decision
  };
}

async function mergeReservedDataPr(env, stub, snapshot, decision) {
  const intent = snapshot.state?.cloud_controller_intent;
  if (!intent || intent.phase !== 'reserved' || intent.action !== 'merge_data_pr') throw new Error('reserved_data_pr_intent_missing');
  if (Number(intent.pr_number) !== Number(decision.pr_number) || intent.base_sha !== decision.base_sha || intent.head_sha !== decision.head_sha) throw new Error('reserved_data_pr_intent_changed');
  const before = Number(intent.before);
  const after = Number(intent.after);
  const additions = Number(intent.additions);
  if (!Number.isInteger(before) || Number(snapshot.state.snapshot_count) !== before || !Number.isInteger(after) || !Number.isInteger(additions) || additions < 1 || after !== before + additions) {
    throw new Error('reserved_data_pr_snapshot_checkpoint_changed');
  }
  const opportunityIds = [...(Array.isArray(intent.opportunity_ids) ? intent.opportunity_ids : [])].map(String).sort();
  if (opportunityIds.length !== additions || new Set(opportunityIds).size !== additions || opportunityIds.some(id => !id)) throw new Error('reserved_data_pr_opportunity_ids_invalid');
  const merged = await mergeControllerPr(env, { pr_number: intent.pr_number, base_sha: intent.base_sha, head_sha: intent.head_sha });
  const nextState = structuredClone(snapshot.state);
  const stateCode = String(intent.state_code || '').toUpperCase();
  if (!stateCode || String(nextState.current?.state_code || '').toUpperCase() !== stateCode) throw new Error('reserved_data_pr_state_checkpoint_changed');
  nextState.snapshot_count = after;
  if (nextState.state_totals && typeof nextState.state_totals === 'object' && !Array.isArray(nextState.state_totals)) {
    const priorStateTotal = Number(nextState.state_totals[stateCode] || 0);
    if (!Number.isInteger(priorStateTotal) || priorStateTotal < 0) throw new Error('reserved_data_pr_state_total_invalid');
    nextState.state_totals = { ...nextState.state_totals, [stateCode]: priorStateTotal + additions };
  }
  nextState.current = {
    ...nextState.current,
    pending_deploy: {
      sha: merged.merge_sha,
      count: after,
      previous_count: before,
      additions,
      opportunity_ids: opportunityIds,
      pr_number: Number(intent.pr_number)
    }
  };
  nextState.status = 'deploying_production';
  delete nextState.cloud_controller_intent;
  nextState.updated_at = new Date().toISOString();
  const checkpoint = await checkpointCloudControllerState(stub, snapshot, nextState);
  return {
    ok: true, executed: true, phase: 'data_pr_merged', pr_number: Number(intent.pr_number),
    merge_sha: merged.merge_sha, merge_reused: merged.reused === true,
    state_version: checkpoint.version, state_sha256: checkpoint.sha256,
    next_status: nextState.status, before, after, additions, opportunity_ids: opportunityIds, decision
  };
}

function productionLiveConsistencyTimeoutSeconds(env) {
  const value = env?.GLOBAL_CONTROLLER_LIVE_CONSISTENCY_TIMEOUT_SECONDS;
  if (value === undefined || value === null || String(value).trim() === '') return 120;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 30 || seconds > 900) throw new Error('production_live_consistency_timeout_invalid');
  return seconds;
}

async function verifyProductionDeploymentGate(env, stub, snapshot, decision) {
  const pending = snapshot.state?.current?.pending_deploy;
  const prNumber = Number(pending?.pr_number);
  if (!Number.isInteger(prNumber) || prNumber <= 0) throw new Error('production_deploy_pr_number_invalid');
  const deployment = await inspectDataMergeChecks(env, prNumber);
  const validated = validatePendingProductionDeployment(snapshot.state, decision, deployment);
  const gate = classifyFrontendProductionDeployment(deployment);
  if (!gate.ready) {
    return {
      ok: true,
      executed: false,
      phase: 'waiting_for_frontend_production_deploy',
      waiting_for: gate.waiting_for,
      pr_number: prNumber,
      merge_sha: validated.merge_sha,
      state_version: snapshot.version,
      state_sha256: snapshot.sha256,
      decision
    };
  }
  const nextState = beginCloudLiveConsistency(snapshot.state, validated, gate, new Date(), {
    timeoutSeconds: productionLiveConsistencyTimeoutSeconds(env)
  });
  const checkpoint = await checkpointCloudControllerState(stub, snapshot, nextState);
  return {
    ok: true,
    executed: true,
    phase: 'frontend_production_deploy_verified',
    pr_number: prNumber,
    merge_sha: validated.merge_sha,
    deployment_check_id: gate.deployment_check_id,
    state_version: checkpoint.version,
    state_sha256: checkpoint.sha256,
    next_status: nextState.status,
    decision
  };
}

function validateLiveConsistencyDecision(state, decision) {
  if (state?.status !== 'waiting_for_live_consistency' || !state?.current?.pending_deploy || !state?.current?.live_consistency) {
    throw new Error('live_consistency_controller_state_invalid');
  }
  const stateCode = String(state.current.state_code || '').trim().toUpperCase();
  if (!stateCode || String(decision?.state_code || '').trim().toUpperCase() !== stateCode) throw new Error('live_consistency_decision_state_mismatch');
  const expectedCount = Number(state.current.pending_deploy.count);
  if (!Number.isInteger(expectedCount) || Number(decision?.expected_count) !== expectedCount) throw new Error('live_consistency_decision_count_mismatch');
  const deploymentId = String(state.current.live_consistency.deployment_id || '');
  if (!deploymentId || String(decision?.deployment_id || '') !== deploymentId) throw new Error('live_consistency_decision_deployment_mismatch');
  return { state_code: stateCode, expected_count: expectedCount, deployment_id: deploymentId };
}

async function verifyLiveConsistency(env, stub, snapshot, decision, options = {}) {
  const identity = validateLiveConsistencyDecision(snapshot.state, decision);
  let live;
  try {
    live = await readLiveUsOpportunityConsistency(identity.state_code, { fetchImpl: options.liveFetch || fetch });
  } catch (error) {
    if (!error?.liveConsistencyTransient) throw error;
    const nextState = recordCloudLiveConsistencyTransientFailure(snapshot.state, error, new Date());
    const checkpoint = await checkpointCloudControllerState(stub, snapshot, nextState);
    return {
      ok: true,
      executed: true,
      phase: 'live_consistency_transient_failure',
      error: String(error?.message || error),
      state_version: checkpoint.version,
      state_sha256: checkpoint.sha256,
      decision
    };
  }

  const consistency = classifyCloudLiveConsistency(snapshot.state.current.pending_deploy, live);
  if (consistency.status === 'waiting') {
    const nextState = recordCloudLiveConsistencyWait(snapshot.state, consistency, new Date());
    const checkpoint = await checkpointCloudControllerState(stub, snapshot, nextState);
    return {
      ok: true,
      executed: true,
      phase: 'live_consistency_waiting',
      live_count: consistency.live_count,
      state_version: checkpoint.version,
      state_sha256: checkpoint.sha256,
      decision
    };
  }

  const nextState = finishCloudLiveConsistency(snapshot.state, consistency, new Date());
  const checkpoint = await checkpointCloudControllerState(stub, snapshot, nextState);
  return {
    ok: true,
    executed: true,
    phase: 'live_consistency_verified',
    live_count: consistency.live_count,
    state_version: checkpoint.version,
    state_sha256: checkpoint.sha256,
    next_status: nextState.status,
    next_batch: nextState.acquisition_batch,
    decision
  };
}

async function checkpointDeferredReplay(stub, snapshot, decision, env) {
  const maximumAttempts = deferredReplayMaximumAttempts(env);
  let transition;
  let phase;

  if (['schedule_deferred_replay', 'schedule_deferred_replay_after_plan_exhaustion'].includes(decision.action)) {
    transition = scheduleCloudDeferredReplay(snapshot.state, decision, new Date(), { maximumAttempts });
    phase = 'deferred_replay_scheduled';
  } else if (decision.action === 'resume_deferred_replay') {
    transition = resolveCloudDeferredReplay(snapshot.state, decision, new Date());
    phase = 'deferred_replay_resolved';
  } else if (decision.action === 'block' && decision.reason === 'deferred_replay_attempts_exhausted') {
    transition = quarantineCloudDeferredReplayExhausted(snapshot.state, decision, new Date(), { maximumAttempts });
    phase = 'deferred_replay_exhausted';
  } else {
    throw new Error(`deferred_replay_action_invalid:${decision.action || 'unknown'}`);
  }

  const checkpoint = await checkpointCloudControllerState(stub, snapshot, transition.next_state);
  return {
    ok: true,
    executed: true,
    phase,
    replay_key: transition.key || transition.unit?.key || null,
    blocker_count: transition.blocker_count ?? null,
    state_version: checkpoint.version,
    state_sha256: checkpoint.sha256,
    next_status: transition.next_state.status,
    decision
  };
}

async function checkpointTerminalDecision(stub, snapshot, decision) {
  if (decision.action === 'complete' && snapshot.state.status === 'complete') {
    return {
      ok: true,
      executed: false,
      phase: 'controller_already_complete',
      state_version: snapshot.version,
      state_sha256: snapshot.sha256,
      decision
    };
  }
  if (decision.action === 'block' && decision.reason === 'unsupported_controller_status') {
    throw new Error(`cloud_controller_unsupported_status:${decision.status || 'unknown'}`);
  }
  if (decision.action === 'block' && decision.reason === 'deferred_blocker' && snapshot.state.status === 'blocked_deferred') {
    const blockers = (Array.isArray(snapshot.state.deferred_units) ? snapshot.state.deferred_units : [])
      .filter(unit => unit?.disposition === 'genuine_blocker');
    if (!blockers.length || Number(decision.blocker_count) !== blockers.length) throw new Error('controller_blocked_checkpoint_evidence_mismatch');
    return {
      ok: true,
      executed: false,
      phase: 'controller_already_blocked',
      blocker_count: blockers.length,
      state_version: snapshot.version,
      state_sha256: snapshot.sha256,
      decision
    };
  }

  let nextState;
  let phase;
  if (decision.action === 'mark_sweep_complete') {
    nextState = markCloudControllerSweepComplete(snapshot.state, new Date());
    phase = 'controller_sweep_complete';
  } else if (decision.action === 'complete') {
    nextState = completeCloudController(snapshot.state, new Date());
    phase = 'controller_complete';
  } else if (decision.action === 'block') {
    nextState = blockCloudController(snapshot.state, decision, new Date());
    phase = 'controller_blocked';
  } else {
    throw new Error(`controller_terminal_action_invalid:${decision.action || 'unknown'}`);
  }
  const checkpoint = await checkpointCloudControllerState(stub, snapshot, nextState);
  return {
    ok: true,
    executed: true,
    phase,
    state_version: checkpoint.version,
    state_sha256: checkpoint.sha256,
    next_status: nextState.status,
    decision
  };
}

export function acquisitionSourceIdBatches(state) {
  const code = String(state?.current?.state_code || '').toUpperCase();
  const sourceIds = Array.isArray(state?.pending_source_ids) ? state.pending_source_ids.map(String) : [];
  if (!code || sourceIds.length < 1) return [];
  const scoped = getStateConfig(code);
  const maximum = Math.max(1, Number(scoped.workflow_batch_max_sources || 4));
  const batches = [];
  for (let index = 0; index < sourceIds.length; index += maximum) batches.push(sourceIds.slice(index, index + maximum));
  return batches;
}

async function reserveAcquisition(env, stub, snapshot, decision) {
  const batches = acquisitionSourceIdBatches(snapshot.state);
  const batchNumber = Number(snapshot.state.acquisition_batch || 1);
  if (batchNumber > batches.length) {
    const nextState = structuredClone(snapshot.state);
    nextState.pending_source_ids = [];
    nextState.acquisition_batch = 1;
    nextState.current = null;
    nextState.status = 'ready';
    nextState.updated_at = new Date().toISOString();
    const checkpoint = await checkpointCloudControllerState(stub, snapshot, nextState);
    return { ok: true, executed: true, phase: 'acquisition_batches_complete', state_version: checkpoint.version, state_sha256: checkpoint.sha256, next_status: 'ready', decision };
  }
  if (!Number.isInteger(batchNumber) || batchNumber < 1 || !batches[batchNumber - 1]?.length) throw new Error('acquisition_batch_checkpoint_invalid');
  const prNumber = Number(snapshot.state?.current?.source_pr);
  if (!Number.isInteger(prNumber) || prNumber <= 0) throw new Error('acquisition_source_pr_checkpoint_missing');
  const deployment = classifyAcquisitionWorkerDeployment(await inspectSourceMergeChecks(env, prNumber));
  if (!deployment.ready) {
    return { ok: true, executed: false, phase: 'waiting_for_acquisition_worker_deploy', waiting_for: deployment.waiting_for, merge_sha: deployment.merge_sha, state_version: snapshot.version, state_sha256: snapshot.sha256, decision };
  }
  const stateCode = String(snapshot.state.current.state_code || '').toUpperCase();
  const scoped = getStateConfig(stateCode);
  const sourceIds = [...batches[batchNumber - 1]];
  const acquisitionDecision = { ...decision, mode: 'acquire', state_code: stateCode, state_name: scoped.name, batch_number: batchNumber, source_ids: sourceIds };
  const nextState = structuredClone(snapshot.state);
  nextState.cloud_controller_intent = {
    phase: 'reserved', action: 'trigger_acquisition', workflow_id: acquisitionWorkflowId(snapshot, acquisitionDecision),
    mode: 'acquire', state_code: stateCode, state_name: scoped.name, batch_number: batchNumber,
    source_ids: sourceIds, source_merge_sha: deployment.merge_sha,
    reserved_from_version: snapshot.version, reserved_from_sha256: snapshot.sha256, reserved_at: new Date().toISOString()
  };
  nextState.updated_at = new Date().toISOString();
  const checkpoint = await checkpointCloudControllerState(stub, snapshot, nextState);
  return { ok: true, executed: true, phase: 'acquisition_reserved', state_version: checkpoint.version, state_sha256: checkpoint.sha256, workflow_id: nextState.cloud_controller_intent.workflow_id, batch_number: batchNumber, source_ids: sourceIds, source_merge_sha: deployment.merge_sha, decision };
}

async function ensureReservedAcquisitionWorkflow(env, stub, snapshot, decision) {
  const dispatch = await assertExecutionAllowed(env, decision);
  const workflowId = decision.workflow_id;
  if (!workflowId) throw new Error('reserved_acquisition_workflow_id_missing');
  await env.GLOBAL_ACQUISITION.createBatch([{ id: workflowId, params: dispatch.payload }]);
  const instance = await env.GLOBAL_ACQUISITION.get(workflowId);
  if (!instance || instance.id !== workflowId) throw new Error('reserved_acquisition_workflow_lookup_failed');
  const nextState = structuredClone(snapshot.state);
  const intent = nextState.cloud_controller_intent;
  if (!intent || intent.action !== 'trigger_acquisition' || intent.phase !== 'reserved' || intent.workflow_id !== workflowId) throw new Error('reserved_acquisition_intent_changed');
  nextState.active_instance = {
    id: workflowId, mode: 'acquire', state_code: intent.state_code, state_name: intent.state_name,
    worker_version: nextState.worker_version || '', worker_sha: nextState.worker_sha || '', started_at: new Date().toISOString()
  };
  nextState.status = 'running_cloudflare_acquisition';
  delete nextState.cloud_controller_intent;
  nextState.updated_at = new Date().toISOString();
  const checkpoint = await checkpointCloudControllerState(stub, snapshot, nextState);
  return { ok: true, executed: true, phase: 'acquisition_workflow_bound', state_version: checkpoint.version, state_sha256: checkpoint.sha256, workflow_id: workflowId, batch_number: intent.batch_number, source_ids: [...intent.source_ids], source_merge_sha: intent.source_merge_sha, decision };
}

export async function runCloudControllerTick(env, options = {}) {
  const execute = options.execute === true;
  const stub = stateStub(env);
  const snapshot = await readSnapshot(stub);
  const decision = decisionForState(snapshot.state, env);
  if (!execute) return { ok: true, executed: false, authority: snapshot.authority, state_version: snapshot.version, state_sha256: snapshot.sha256, decision };
  if (snapshot.authority !== 'authoritative') throw new Error(`controller_state_not_authoritative:${snapshot.authority}`);
  await assertExecutionAllowed(env, decision);
  if (decision.action === 'trigger_discovery') return reserveDiscovery(stub, snapshot, decision);
  if (decision.action === 'trigger_reserved_discovery') return ensureReservedDiscoveryWorkflow(env, stub, snapshot, decision);
  if (decision.action === 'inspect_active_workflow') return inspectActiveWorkflow(env, stub, snapshot, decision);
  if (decision.action === 'review_source_pr') return reserveSourcePrMerge(env, stub, snapshot, decision);
  if (decision.action === 'merge_reserved_source_pr') return mergeReservedSourcePr(env, stub, snapshot, decision);
  if (decision.action === 'review_data_pr') return reserveDataPrMerge(env, stub, snapshot, decision);
  if (decision.action === 'merge_reserved_data_pr') return mergeReservedDataPr(env, stub, snapshot, decision);
  if (decision.action === 'verify_or_deploy_production') return verifyProductionDeploymentGate(env, stub, snapshot, decision);
  if (decision.action === 'verify_live_consistency') return verifyLiveConsistency(env, stub, snapshot, decision, options);
  if (['schedule_deferred_replay', 'schedule_deferred_replay_after_plan_exhaustion', 'resume_deferred_replay'].includes(decision.action)) {
    return checkpointDeferredReplay(stub, snapshot, decision, env);
  }
  if (decision.action === 'block' && decision.reason === 'deferred_replay_attempts_exhausted') {
    return checkpointDeferredReplay(stub, snapshot, decision, env);
  }
  if (decision.action === 'trigger_acquisition_or_advance_batch') return reserveAcquisition(env, stub, snapshot, decision);
  if (decision.action === 'trigger_reserved_acquisition') return ensureReservedAcquisitionWorkflow(env, stub, snapshot, decision);
  if (['mark_sweep_complete', 'complete', 'block'].includes(decision.action)) return checkpointTerminalDecision(stub, snapshot, decision);
  throw new Error(`cloud_controller_action_not_implemented:${decision.action}`);
}
