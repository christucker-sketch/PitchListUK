import { assertGlobalControllerDispatchAllowed, resolveGlobalAcquisitionDispatch } from './dispatch.mjs';
import { readMainMarketSnapshot } from './github-publication.mjs';
import { readMainUkSourceRegistry } from './uk-source-publication.mjs';
import {
  inspectUkControllerPr,
  inspectUkMergeChecks,
  mergeUkControllerPr,
  validateUkDataPr,
  validateUkSourcePr
} from './uk-controller-github-client.mjs';

const UK_PLAN_SIZE = 96;
const UK_QUERY_LIMIT = 4;
const UK_ACTIVE_WORKFLOW_STALE_MS = 30 * 60 * 1000;
const SOURCE_DEPLOY_CHECKS = Object.freeze(['verify', 'deploy_and_prove']);
const FRONTEND_DEPLOY_CHECKS = Object.freeze(['verify', 'deploy_frontend_production']);

export function globalUkControllerCutoverEnabled(env = {}) {
  return String(env.GLOBAL_UK_CONTROLLER_CUTOVER_ENABLED || '').trim().toLowerCase() === 'true';
}

export function ukControllerStateStub(env) {
  if (!env?.CONTROLLER_STATE) throw new Error('uk_controller_state_binding_missing');
  return env.CONTROLLER_STATE.get(env.CONTROLLER_STATE.idFromName('uk-controller'));
}

async function readSnapshot(stub) {
  const response = await stub.fetch('https://controller-state.internal/snapshot');
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`uk_controller_state_read_http_${response.status}`);
  const text = await response.text();
  return {
    state: JSON.parse(text),
    version: Number(response.headers.get('x-findpitches-state-version') || 0),
    sha256: String(response.headers.get('x-findpitches-state-sha256') || ''),
    authority: String(response.headers.get('x-findpitches-state-authority') || 'unknown')
  };
}

async function checkpoint(stub, snapshot, nextState) {
  const response = await stub.fetch(new Request('https://controller-state.internal/checkpoint', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'x-findpitches-expected-state-version': String(snapshot.version),
      'x-findpitches-expected-state-sha256': String(snapshot.sha256)
    },
    body: `${JSON.stringify(nextState, null, 2)}\n`
  }));
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `uk_controller_checkpoint_http_${response.status}`);
  return body;
}

export function buildInitialUkControllerState({ productionCount = 0, sourceCount = 0, mainSha = null, now = new Date().toISOString() } = {}) {
  return {
    controller_kind: 'uk',
    status: 'ready_discovery',
    query_offset: 0,
    query_limit: UK_QUERY_LIMIT,
    plan_size: UK_PLAN_SIZE,
    cycle: 0,
    active_instance: null,
    cloud_controller_intent: null,
    last_discovery: null,
    last_acquisition: null,
    pending_source_pr: null,
    pending_data_pr: null,
    pending_deployment: null,
    production_count: Number(productionCount || 0),
    source_count: Number(sourceCount || 0),
    base_main_sha: mainSha || null,
    totals: {
      discovery_runs: 0,
      acquisition_runs: 0,
      source_additions: 0,
      opportunity_additions: 0,
      source_prs_merged: 0,
      data_prs_merged: 0
    },
    results: [],
    updated_at: String(now)
  };
}

async function initializeShadowState(env, stub) {
  const [market, sources] = await Promise.all([
    readMainMarketSnapshot(env, 'UK'),
    readMainUkSourceRegistry(env)
  ]);
  const state = buildInitialUkControllerState({
    productionCount: market.snapshot.rows.length,
    sourceCount: sources.registry.length,
    mainSha: market.mainSha,
    now: new Date().toISOString()
  });
  const response = await stub.fetch(new Request('https://controller-state.internal/snapshot', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'x-findpitches-state-source': 'cloudflare-uk-controller-bootstrap',
      'x-findpitches-state-authority': 'shadow'
    },
    body: `${JSON.stringify(state, null, 2)}\n`
  }));
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `uk_controller_initialize_http_${response.status}`);
  return { state, version: Number(body.version), sha256: String(body.sha256 || ''), authority: 'shadow' };
}

function reservedDecision(state) {
  const intent = state?.cloud_controller_intent;
  if (!intent || intent.phase !== 'reserved') return null;
  if (intent.action === 'start_discovery') return { action: 'bind_reserved_discovery', workflow_id: intent.workflow_id };
  if (intent.action === 'start_acquisition') return { action: 'bind_reserved_acquisition', workflow_id: intent.workflow_id };
  if (intent.action === 'merge_source_pr') return { action: 'merge_reserved_source_pr', pr_number: intent.pr_number };
  if (intent.action === 'merge_data_pr') return { action: 'merge_reserved_data_pr', pr_number: intent.pr_number };
  throw new Error(`uk_controller_reserved_intent_unsupported:${intent.action || 'unknown'}`);
}

export function ukControllerDecision(state) {
  if (!state || state.controller_kind !== 'uk') throw new Error('uk_controller_state_invalid');
  const reserved = reservedDecision(state);
  if (reserved) return reserved;
  if (state.active_instance?.id) return { action: 'inspect_active_workflow', workflow_id: state.active_instance.id, mode: state.active_instance.mode };
  if (state.status === 'ready_discovery') return { action: 'start_discovery', query_offset: Number(state.query_offset || 0), query_limit: Number(state.query_limit || UK_QUERY_LIMIT), cycle: Number(state.cycle || 0) };
  if (state.status === 'reviewing_source_pr') return { action: 'review_source_pr', pr_number: Number(state.pending_source_pr?.pr_number || 0) };
  if (state.status === 'waiting_source_deploy') return { action: 'verify_source_deploy', merge_sha: state.pending_deployment?.merge_sha || null };
  if (state.status === 'ready_acquisition') return { action: 'start_acquisition', cycle: Number(state.cycle || 0) };
  if (state.status === 'reviewing_data_pr') return { action: 'review_data_pr', pr_number: Number(state.pending_data_pr?.pr_number || 0) };
  if (state.status === 'waiting_frontend_deploy') return { action: 'verify_frontend_deploy', merge_sha: state.pending_deployment?.merge_sha || null };
  if (state.status === 'blocked') return { action: 'blocked', reason: state.blocker || 'unknown' };
  throw new Error(`uk_controller_status_unsupported:${state.status || 'unknown'}`);
}

function discoveryWorkflowId(snapshot, decision) {
  return `ukctl-v${snapshot.version}-discover-q${decision.query_offset}-l${decision.query_limit}`;
}

function acquisitionWorkflowId(snapshot, state) {
  return `ukctl-v${snapshot.version}-acquire-c${Number(state.cycle || 0)}`;
}

function appendResult(state, item) {
  const results = Array.isArray(state.results) ? [...state.results, item] : [item];
  state.results = results.slice(-24);
}

function normalizeWorkflowOutput(value) {
  let output = value;
  for (let depth = 0; depth < 2 && typeof output === 'string'; depth += 1) output = JSON.parse(output);
  if (!output || typeof output !== 'object' || Array.isArray(output)) throw new Error('uk_controller_workflow_output_invalid');
  return output;
}

export function ukActiveWorkflowIsStale(active, { now = Date.now(), staleAfterMs = UK_ACTIVE_WORKFLOW_STALE_MS } = {}) {
  const startedAt = Date.parse(String(active?.started_at || ''));
  if (!Number.isFinite(startedAt)) return true;
  return Number(now) - startedAt >= Number(staleAfterMs);
}

export function recoverUkActiveWorkflowState(state, active, { reason = 'stale_workflow', now = new Date().toISOString() } = {}) {
  if (!active?.id) throw new Error('uk_controller_recovery_active_workflow_missing');
  if (!['discovery', 'acquisition'].includes(active.mode)) throw new Error('uk_controller_recovery_active_mode_unsupported');
  const next = structuredClone(state);
  next.active_instance = null;
  next.cloud_controller_intent = null;
  next.status = active.mode === 'discovery' ? 'ready_discovery' : 'ready_acquisition';
  appendResult(next, {
    workflow_id: active.id,
    mode: active.mode,
    recovered_at: String(now),
    recovery_reason: String(reason)
  });
  next.updated_at = String(now);
  return next;
}

async function checkpointRecoveredActiveWorkflow(stub, snapshot, active, reason, decision) {
  const next = recoverUkActiveWorkflowState(snapshot.state, active, { reason });
  const written = await checkpoint(stub, snapshot, next);
  return {
    ok: true,
    executed: true,
    phase: 'workflow_recovered',
    workflow_id: active.id,
    recovery_reason: String(reason),
    next_status: next.status,
    state_version: written.version,
    state_sha256: written.sha256,
    decision
  };
}

async function reserveWorkflow(stub, snapshot, decision, mode) {
  const next = structuredClone(snapshot.state);
  const workflowId = mode === 'discovery' ? discoveryWorkflowId(snapshot, decision) : acquisitionWorkflowId(snapshot, next);
  next.cloud_controller_intent = {
    phase: 'reserved',
    action: mode === 'discovery' ? 'start_discovery' : 'start_acquisition',
    workflow_id: workflowId,
    mode,
    query_offset: mode === 'discovery' ? Number(decision.query_offset) : undefined,
    query_limit: mode === 'discovery' ? Number(decision.query_limit) : undefined,
    reserved_from_version: snapshot.version,
    reserved_from_sha256: snapshot.sha256,
    reserved_at: new Date().toISOString()
  };
  next.updated_at = new Date().toISOString();
  const written = await checkpoint(stub, snapshot, next);
  return { ok: true, executed: true, phase: 'reserved', workflow_id: workflowId, state_version: written.version, state_sha256: written.sha256, decision };
}

async function bindReservedWorkflow(env, stub, snapshot, decision) {
  const intent = snapshot.state.cloud_controller_intent;
  if (!intent || intent.phase !== 'reserved' || intent.workflow_id !== decision.workflow_id) throw new Error('uk_controller_reserved_workflow_changed');
  const discovery = intent.mode === 'discovery';
  const payload = discovery
    ? {
        country: 'UK', mode: 'uk_source_discovery_pr', as_of: new Date().toISOString(),
        direct_seed_limit: 50, serper_fallback: true, query_offset: Number(intent.query_offset || 0),
        query_limit: Number(intent.query_limit || UK_QUERY_LIMIT), results_per_query: 5,
        candidate_limit: 40, concurrency: 3, timeout_ms: 12000,
        trigger: 'uk-cloud-controller'
      }
    : {
        country: 'UK', mode: 'uk_additions_only_pr', as_of: new Date().toISOString(),
        batch_size: 8, concurrency: 3, timeout_ms: 12000, max_attempts: 1,
        max_additions: 50, max_growth_percent: 25, max_per_source: 1, max_duplicate_rate: 60,
        trigger: 'uk-cloud-controller'
      };
  const dispatch = resolveGlobalAcquisitionDispatch(payload);
  assertGlobalControllerDispatchAllowed(env, dispatch);
  await env.GLOBAL_ACQUISITION.createBatch([{ id: intent.workflow_id, params: dispatch.payload }]);
  const instance = await env.GLOBAL_ACQUISITION.get(intent.workflow_id);
  if (!instance || instance.id !== intent.workflow_id) throw new Error('uk_controller_workflow_lookup_failed');
  const next = structuredClone(snapshot.state);
  next.active_instance = {
    id: intent.workflow_id,
    mode: intent.mode,
    query_offset: intent.query_offset ?? null,
    query_limit: intent.query_limit ?? null,
    started_at: new Date().toISOString()
  };
  next.status = discovery ? 'running_discovery' : 'running_acquisition';
  next.cloud_controller_intent = null;
  next.updated_at = new Date().toISOString();
  const written = await checkpoint(stub, snapshot, next);
  return { ok: true, executed: true, phase: 'workflow_bound', workflow_id: intent.workflow_id, state_version: written.version, state_sha256: written.sha256, decision };
}

async function inspectActiveWorkflow(env, stub, snapshot, decision) {
  const active = snapshot.state.active_instance;
  if (!active?.id || active.id !== decision.workflow_id) throw new Error('uk_controller_active_workflow_mismatch');
  const stale = ukActiveWorkflowIsStale(active);
  let instance;
  try {
    instance = await env.GLOBAL_ACQUISITION.get(active.id);
  } catch (error) {
    if (stale) return checkpointRecoveredActiveWorkflow(stub, snapshot, active, `lookup_error:${String(error?.message || error)}`, decision);
    throw error;
  }
  if (!instance || typeof instance.status !== 'function') {
    if (stale) return checkpointRecoveredActiveWorkflow(stub, snapshot, active, 'lookup_failed', decision);
    throw new Error('uk_controller_active_workflow_lookup_failed');
  }
  let details;
  try {
    details = await instance.status();
  } catch (error) {
    if (stale) return checkpointRecoveredActiveWorkflow(stub, snapshot, active, `status_error:${String(error?.message || error)}`, decision);
    throw error;
  }
  const status = String(details?.status || 'unknown');
  if (['queued', 'running', 'waiting', 'waitingForPause'].includes(status)) {
    if (stale) return checkpointRecoveredActiveWorkflow(stub, snapshot, active, `stale_${status}`, decision);
    return { ok: true, executed: false, phase: 'workflow_observed', workflow_id: active.id, workflow_status: status, state_version: snapshot.version, state_sha256: snapshot.sha256, decision };
  }
  if (status !== 'complete') {
    return checkpointRecoveredActiveWorkflow(stub, snapshot, active, `terminal_${status}:${String(details?.error?.message || '')}`, decision);
  }
  const result = normalizeWorkflowOutput(details.output);
  if (result.country !== 'UK') throw new Error('uk_controller_workflow_country_mismatch');
  const next = structuredClone(snapshot.state);
  next.active_instance = null;
  appendResult(next, { workflow_id: active.id, mode: active.mode, completed_at: new Date().toISOString(), result });

  if (active.mode === 'discovery') {
    if (result.mode !== 'uk_source_discovery_pr') throw new Error('uk_controller_discovery_mode_mismatch');
    const previousOffset = Number(active.query_offset || next.query_offset || 0);
    const limit = Number(active.query_limit || next.query_limit || UK_QUERY_LIMIT);
    const advanced = previousOffset + limit;
    next.query_offset = advanced >= UK_PLAN_SIZE ? advanced % UK_PLAN_SIZE : advanced;
    if (advanced >= UK_PLAN_SIZE) next.cycle = Number(next.cycle || 0) + 1;
    next.totals.discovery_runs = Number(next.totals?.discovery_runs || 0) + 1;
    next.totals.source_additions = Number(next.totals?.source_additions || 0) + Number(result.source_additions || 0);
    next.last_discovery = { workflow_id: active.id, result };
    const prNumber = Number(result?.source_pr?.pr_number || 0);
    if (Number(result.source_additions || 0) > 0 && prNumber > 0) {
      next.pending_source_pr = { pr_number: prNumber, workflow_id: active.id };
      next.status = 'reviewing_source_pr';
    } else {
      next.status = 'ready_acquisition';
    }
  } else if (active.mode === 'acquisition') {
    if (result.mode !== 'uk_additions_only_pr') throw new Error('uk_controller_acquisition_mode_mismatch');
    next.totals.acquisition_runs = Number(next.totals?.acquisition_runs || 0) + 1;
    next.totals.opportunity_additions = Number(next.totals?.opportunity_additions || 0) + Number(result.manifest_additions || 0);
    next.last_acquisition = { workflow_id: active.id, result };
    const prNumber = Number(result?.opportunity_pr?.pr_number || 0);
    if (Number(result.manifest_additions || 0) > 0 && prNumber > 0) {
      next.pending_data_pr = { pr_number: prNumber, workflow_id: active.id };
      next.status = 'reviewing_data_pr';
    } else {
      next.status = 'ready_discovery';
    }
  } else {
    throw new Error(`uk_controller_active_mode_unsupported:${active.mode || 'unknown'}`);
  }
  next.updated_at = new Date().toISOString();
  const written = await checkpoint(stub, snapshot, next);
  return { ok: true, executed: true, phase: 'workflow_completed', workflow_id: active.id, workflow_status: status, next_status: next.status, state_version: written.version, state_sha256: written.sha256, decision };
}

export function ukControllerPrFailureReason(pr) {
  if (pr?.merged) return null;
  const state = String(pr?.state || '').toUpperCase();
  if (state && state !== 'OPEN') return `closed_unmerged:${state.toLowerCase()}`;
  const runs = Array.isArray(pr?.check_runs) ? pr.check_runs : [];
  if (!runs.length || !runs.every(run => run?.status === 'completed')) return null;
  const failed = runs.filter(run => !['success', 'neutral', 'skipped'].includes(String(run?.conclusion || '')));
  return failed.length ? `terminal_ci_failure:${failed.map(run => run.name || 'unknown').join(',')}` : null;
}

async function checkpointRejectedPr(stub, snapshot, decision, kind, reason) {
  const next = structuredClone(snapshot.state);
  if (kind === 'source') {
    next.pending_source_pr = null;
    next.status = 'ready_discovery';
  } else {
    next.pending_data_pr = null;
    next.status = 'ready_acquisition';
  }
  appendResult(next, {
    pr_number: Number(decision.pr_number),
    mode: kind === 'source' ? 'source_pr' : 'data_pr',
    recovered_at: new Date().toISOString(),
    recovery_reason: String(reason)
  });
  next.updated_at = new Date().toISOString();
  const written = await checkpoint(stub, snapshot, next);
  return {
    ok: true,
    executed: true,
    phase: `${kind}_pr_rejected`,
    pr_number: Number(decision.pr_number),
    recovery_reason: String(reason),
    next_status: next.status,
    state_version: written.version,
    state_sha256: written.sha256,
    decision
  };
}

async function reservePrMerge(env, stub, snapshot, decision, kind) {
  const result = kind === 'source' ? snapshot.state.last_discovery?.result : snapshot.state.last_acquisition?.result;
  if (!result) throw new Error(`uk_controller_${kind}_result_missing`);
  const pr = await inspectUkControllerPr(env, decision.pr_number);
  const failureReason = ukControllerPrFailureReason(pr);
  if (failureReason) return checkpointRejectedPr(stub, snapshot, decision, kind, failureReason);
  const validated = kind === 'source' ? validateUkSourcePr(result, pr) : validateUkDataPr(result, pr);
  if (!validated.ready) {
    return { ok: true, executed: false, phase: `${kind}_pr_checks_pending`, pr_number: decision.pr_number, state_version: snapshot.version, state_sha256: snapshot.sha256, decision };
  }
  const next = structuredClone(snapshot.state);
  next.cloud_controller_intent = {
    phase: 'reserved', action: kind === 'source' ? 'merge_source_pr' : 'merge_data_pr',
    pr_number: validated.pr_number, head_sha: validated.head_sha, base_sha: validated.base_sha,
    additions: validated.additions, before: validated.before ?? null, after: validated.after ?? null,
    reserved_from_version: snapshot.version, reserved_from_sha256: snapshot.sha256, reserved_at: new Date().toISOString()
  };
  next.updated_at = new Date().toISOString();
  const written = await checkpoint(stub, snapshot, next);
  return { ok: true, executed: true, phase: `${kind}_pr_merge_reserved`, pr_number: validated.pr_number, state_version: written.version, state_sha256: written.sha256, decision };
}

async function mergeReservedPr(env, stub, snapshot, decision, kind) {
  const intent = snapshot.state.cloud_controller_intent;
  const expectedAction = kind === 'source' ? 'merge_source_pr' : 'merge_data_pr';
  if (!intent || intent.phase !== 'reserved' || intent.action !== expectedAction || Number(intent.pr_number) !== Number(decision.pr_number)) {
    throw new Error(`uk_controller_reserved_${kind}_pr_changed`);
  }
  const merged = await mergeUkControllerPr(env, { pr_number: intent.pr_number, head_sha: intent.head_sha, base_sha: intent.base_sha });
  const next = structuredClone(snapshot.state);
  next.cloud_controller_intent = null;
  next.pending_deployment = {
    kind: kind === 'source' ? 'source_worker' : 'frontend',
    pr_number: Number(intent.pr_number),
    merge_sha: merged.merge_sha,
    started_at: new Date().toISOString()
  };
  if (kind === 'source') {
    next.pending_source_pr = null;
    next.totals.source_prs_merged = Number(next.totals?.source_prs_merged || 0) + 1;
    next.source_count = Number(next.source_count || 0) + Number(intent.additions || 0);
    next.status = 'waiting_source_deploy';
  } else {
    next.pending_data_pr = null;
    next.totals.data_prs_merged = Number(next.totals?.data_prs_merged || 0) + 1;
    next.production_count = Number(intent.after || next.production_count || 0);
    next.status = 'waiting_frontend_deploy';
  }
  next.updated_at = new Date().toISOString();
  const written = await checkpoint(stub, snapshot, next);
  return { ok: true, executed: true, phase: `${kind}_pr_merged`, pr_number: Number(intent.pr_number), merge_sha: merged.merge_sha, next_status: next.status, state_version: written.version, state_sha256: written.sha256, decision };
}

async function verifyDeployment(env, stub, snapshot, decision, kind) {
  const pending = snapshot.state.pending_deployment;
  if (!pending?.merge_sha || pending.merge_sha !== decision.merge_sha) throw new Error('uk_controller_pending_deployment_mismatch');
  const required = kind === 'source' ? SOURCE_DEPLOY_CHECKS : FRONTEND_DEPLOY_CHECKS;
  const inspection = await inspectUkMergeChecks(env, pending.merge_sha, required);
  if (!inspection.ready) {
    return { ok: true, executed: false, phase: `${kind}_deployment_pending`, merge_sha: pending.merge_sha, waiting_for: inspection.pending, state_version: snapshot.version, state_sha256: snapshot.sha256, decision };
  }
  const next = structuredClone(snapshot.state);
  next.pending_deployment = null;
  next.status = kind === 'source' ? 'ready_acquisition' : 'ready_discovery';
  next.updated_at = new Date().toISOString();
  const written = await checkpoint(stub, snapshot, next);
  return { ok: true, executed: true, phase: `${kind}_deployment_verified`, merge_sha: pending.merge_sha, next_status: next.status, state_version: written.version, state_sha256: written.sha256, decision };
}

export async function runUkCloudControllerTick(env, { execute = false } = {}) {
  const stub = ukControllerStateStub(env);
  let snapshot = await readSnapshot(stub);
  let initialized = false;
  if (!snapshot) {
    snapshot = await initializeShadowState(env, stub);
    initialized = true;
  }
  const decision = ukControllerDecision(snapshot.state);
  const cutoverEnabled = globalUkControllerCutoverEnabled(env);
  if (!execute || snapshot.authority !== 'authoritative' || !cutoverEnabled) {
    return {
      ok: true,
      executed: false,
      initialized,
      authority: snapshot.authority,
      cutover_enabled: cutoverEnabled,
      state_version: snapshot.version,
      state_sha256: snapshot.sha256,
      status: snapshot.state.status,
      production_count: snapshot.state.production_count,
      source_count: snapshot.state.source_count,
      decision
    };
  }

  switch (decision.action) {
    case 'start_discovery': return reserveWorkflow(stub, snapshot, decision, 'discovery');
    case 'bind_reserved_discovery': return bindReservedWorkflow(env, stub, snapshot, decision);
    case 'inspect_active_workflow': return inspectActiveWorkflow(env, stub, snapshot, decision);
    case 'review_source_pr': return reservePrMerge(env, stub, snapshot, decision, 'source');
    case 'merge_reserved_source_pr': return mergeReservedPr(env, stub, snapshot, decision, 'source');
    case 'verify_source_deploy': return verifyDeployment(env, stub, snapshot, decision, 'source');
    case 'start_acquisition': return reserveWorkflow(stub, snapshot, decision, 'acquisition');
    case 'bind_reserved_acquisition': return bindReservedWorkflow(env, stub, snapshot, decision);
    case 'review_data_pr': return reservePrMerge(env, stub, snapshot, decision, 'data');
    case 'merge_reserved_data_pr': return mergeReservedPr(env, stub, snapshot, decision, 'data');
    case 'verify_frontend_deploy': return verifyDeployment(env, stub, snapshot, decision, 'frontend');
    case 'blocked': return { ok: false, executed: false, state_version: snapshot.version, state_sha256: snapshot.sha256, decision };
    default: throw new Error(`uk_controller_decision_unsupported:${decision.action}`);
  }
}

export { UK_PLAN_SIZE, UK_QUERY_LIMIT, UK_ACTIVE_WORKFLOW_STALE_MS, SOURCE_DEPLOY_CHECKS, FRONTEND_DEPLOY_CHECKS };
