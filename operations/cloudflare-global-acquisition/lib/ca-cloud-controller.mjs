import { githubJson } from './github-publication.mjs';
import { parseAcquisitionSnapshotModule } from '../../../platform/acquisition/global-engine.mjs';
import { CA_DISCOVERY_PLAN_SIZE } from './ca-source-discovery-plan.mjs';
import { assertGlobalControllerDispatchAllowed, resolveGlobalAcquisitionDispatch } from './dispatch.mjs';
import {
  inspectCaControllerPr,
  inspectCaMergeChecks,
  mergeCaControllerPr,
  validateCaSourcePr
} from './ca-controller-github-client.mjs';
import {
  inspectAndValidateCaDataPr,
  inspectCaFrontendDeployment,
  mergeValidatedCaDataPr
} from './ca-controller-data-pr.mjs';

const CA_QUERY_LIMIT = 4;
const CA_ACTIVE_WORKFLOW_STALE_MS = 30 * 60 * 1000;
const CA_SNAPSHOT_PATH = 'functions/_data/ca-opportunities.mjs';
const CA_SOURCE_REGISTRY_PATH = 'operations/opportunity-pipeline/config/ca-approved-source-routes.json';
const SOURCE_DEPLOY_CHECKS = Object.freeze(['verify', 'deploy_and_prove']);

function decodeBase64Utf8(value) {
  const binary = atob(String(value || '').replace(/\s+/g, ''));
  return new TextDecoder().decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
}

export function globalCaControllerCutoverEnabled(env = {}) {
  return String(env.GLOBAL_CA_CONTROLLER_CUTOVER_ENABLED || '').trim().toLowerCase() === 'true';
}

export function caControllerStateStub(env) {
  if (!env?.CA_CONTROLLER_STATE) throw new Error('ca_controller_state_binding_missing');
  return env.CA_CONTROLLER_STATE.get(env.CA_CONTROLLER_STATE.idFromName('ca-controller'));
}

async function readSnapshot(stub) {
  const response = await stub.fetch('https://controller-state.internal/snapshot');
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`ca_controller_state_read_http_${response.status}`);
  return {
    state: JSON.parse(await response.text()),
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
  if (!response.ok) throw new Error(body?.error || `ca_controller_checkpoint_http_${response.status}`);
  return body;
}

async function readCanadaBases(env) {
  const [ref, snapshotFile, sourceFile] = await Promise.all([
    githubJson(env, '/git/ref/heads/main'),
    githubJson(env, `/contents/${CA_SNAPSHOT_PATH}?ref=main`),
    githubJson(env, `/contents/${CA_SOURCE_REGISTRY_PATH}?ref=main`)
  ]);
  const snapshot = parseAcquisitionSnapshotModule(decodeBase64Utf8(snapshotFile?.content), 'CA');
  const registry = JSON.parse(decodeBase64Utf8(sourceFile?.content));
  if (!Array.isArray(snapshot.rows) || Number(snapshot.total) !== snapshot.rows.length) throw new Error('ca_controller_snapshot_invalid');
  if (!Array.isArray(registry)) throw new Error('ca_controller_source_registry_invalid');
  return {
    mainSha: String(ref?.object?.sha || ''),
    productionCount: snapshot.rows.length,
    sourceCount: registry.length
  };
}

export function buildInitialCaControllerState({ productionCount = 0, sourceCount = 0, mainSha = null, now = new Date().toISOString() } = {}) {
  return {
    controller_kind: 'ca',
    status: 'ready_discovery',
    query_offset: 0,
    query_limit: CA_QUERY_LIMIT,
    plan_size: CA_DISCOVERY_PLAN_SIZE,
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
  const base = await readCanadaBases(env);
  const state = buildInitialCaControllerState({ ...base, now: new Date().toISOString() });
  const response = await stub.fetch(new Request('https://controller-state.internal/snapshot', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'x-findpitches-state-source': 'cloudflare-ca-controller-bootstrap',
      'x-findpitches-state-authority': 'shadow'
    },
    body: `${JSON.stringify(state, null, 2)}\n`
  }));
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `ca_controller_initialize_http_${response.status}`);
  return { state, version: Number(body.version), sha256: String(body.sha256 || ''), authority: 'shadow' };
}

function reservedDecision(state) {
  const intent = state?.cloud_controller_intent;
  if (!intent || intent.phase !== 'reserved') return null;
  if (intent.action === 'start_discovery') return { action: 'bind_reserved_discovery', workflow_id: intent.workflow_id };
  if (intent.action === 'start_acquisition') return { action: 'bind_reserved_acquisition', workflow_id: intent.workflow_id };
  if (intent.action === 'merge_source_pr') return { action: 'merge_reserved_source_pr', pr_number: Number(intent.pr_number || 0) };
  if (intent.action === 'merge_data_pr') return { action: 'merge_reserved_data_pr', pr_number: Number(intent.pr_number || 0) };
  throw new Error(`ca_controller_reserved_intent_unsupported:${intent.action || 'unknown'}`);
}

export function caControllerDecision(state) {
  if (!state || state.controller_kind !== 'ca') throw new Error('ca_controller_state_invalid');
  const reserved = reservedDecision(state);
  if (reserved) return reserved;
  if (state.active_instance?.id) return { action: 'inspect_active_workflow', workflow_id: state.active_instance.id, mode: state.active_instance.mode };
  if (state.status === 'ready_discovery') return {
    action: 'start_discovery',
    query_offset: Number(state.query_offset || 0),
    query_limit: Number(state.query_limit || CA_QUERY_LIMIT),
    cycle: Number(state.cycle || 0)
  };
  if (state.status === 'reviewing_source_pr') return { action: 'review_source_pr', pr_number: Number(state.pending_source_pr?.pr_number || 0) };
  if (state.status === 'waiting_source_deploy') return { action: 'verify_source_deploy', merge_sha: state.pending_deployment?.merge_sha || null };
  if (state.status === 'ready_acquisition') return { action: 'start_acquisition', cycle: Number(state.cycle || 0) };
  if (state.status === 'reviewing_data_pr') return { action: 'review_data_pr', pr_number: Number(state.pending_data_pr?.pr_number || 0) };
  if (state.status === 'waiting_frontend_deploy') return { action: 'verify_frontend_deploy', merge_sha: state.pending_deployment?.merge_sha || null };
  if (state.status === 'blocked') return { action: 'blocked', reason: state.blocker || 'unknown' };
  return { action: 'await_implementation', status: state.status };
}

function workflowId(snapshot, decision, mode) {
  if (mode === 'discovery') return `cactl-v${snapshot.version}-discover-q${decision.query_offset}-l${decision.query_limit}`;
  return `cactl-v${snapshot.version}-acquire-c${Number(snapshot.state.cycle || 0)}`;
}

function appendResult(state, item) {
  const results = Array.isArray(state.results) ? [...state.results, item] : [item];
  state.results = results.slice(-24);
}

function normalizeWorkflowOutput(value) {
  let output = value;
  for (let depth = 0; depth < 2 && typeof output === 'string'; depth += 1) output = JSON.parse(output);
  if (!output || typeof output !== 'object' || Array.isArray(output)) throw new Error('ca_controller_workflow_output_invalid');
  return output;
}

export function caActiveWorkflowIsStale(active, { now = Date.now(), staleAfterMs = CA_ACTIVE_WORKFLOW_STALE_MS } = {}) {
  const startedAt = Date.parse(String(active?.started_at || ''));
  if (!Number.isFinite(startedAt)) return true;
  return Number(now) - startedAt >= Number(staleAfterMs);
}

export function recoverCaActiveWorkflowState(state, active, { reason = 'stale_workflow', now = new Date().toISOString() } = {}) {
  if (!active?.id) throw new Error('ca_controller_recovery_active_workflow_missing');
  if (!['discovery', 'acquisition'].includes(active.mode)) throw new Error('ca_controller_recovery_active_mode_unsupported');
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
  const next = recoverCaActiveWorkflowState(snapshot.state, active, { reason });
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
  const id = workflowId(snapshot, decision, mode);
  next.cloud_controller_intent = {
    phase: 'reserved',
    action: mode === 'discovery' ? 'start_discovery' : 'start_acquisition',
    workflow_id: id,
    mode,
    ...(mode === 'discovery' ? {
      query_offset: Number(decision.query_offset),
      query_limit: Number(decision.query_limit)
    } : {}),
    reserved_from_version: snapshot.version,
    reserved_from_sha256: snapshot.sha256,
    reserved_at: new Date().toISOString()
  };
  next.updated_at = new Date().toISOString();
  const written = await checkpoint(stub, snapshot, next);
  return { ok: true, executed: true, phase: 'reserved', workflow_id: id, state_version: written.version, state_sha256: written.sha256, decision };
}

async function bindReservedWorkflow(env, stub, snapshot, decision, mode) {
  const intent = snapshot.state.cloud_controller_intent;
  const expectedAction = mode === 'discovery' ? 'start_discovery' : 'start_acquisition';
  if (!intent || intent.phase !== 'reserved' || intent.action !== expectedAction || intent.workflow_id !== decision.workflow_id) {
    throw new Error('ca_controller_reserved_workflow_changed');
  }
  const payload = mode === 'discovery'
    ? {
        country: 'CA',
        mode: 'ca_source_discovery_pr',
        as_of: new Date().toISOString(),
        query_offset: Number(intent.query_offset || 0),
        query_limit: Number(intent.query_limit || CA_QUERY_LIMIT),
        results_per_query: 5,
        candidate_limit: 24,
        timeout_ms: 12000,
        trigger: 'ca-cloud-controller'
      }
    : {
        country: 'CA',
        mode: 'ca_additions_only_pr',
        as_of: new Date().toISOString(),
        concurrency: 3,
        timeout_ms: 12000,
        max_additions: 10,
        trigger: 'ca-cloud-controller'
      };
  const dispatch = resolveGlobalAcquisitionDispatch(payload);
  assertGlobalControllerDispatchAllowed(env, dispatch);
  await env.GLOBAL_ACQUISITION.createBatch([{ id: intent.workflow_id, params: dispatch.payload }]);
  const instance = await env.GLOBAL_ACQUISITION.get(intent.workflow_id);
  if (!instance || instance.id !== intent.workflow_id) throw new Error('ca_controller_workflow_lookup_failed');

  const next = structuredClone(snapshot.state);
  next.active_instance = {
    id: intent.workflow_id,
    mode,
    query_offset: mode === 'discovery' ? Number(intent.query_offset || 0) : null,
    query_limit: mode === 'discovery' ? Number(intent.query_limit || CA_QUERY_LIMIT) : null,
    started_at: new Date().toISOString()
  };
  next.status = mode === 'discovery' ? 'running_discovery' : 'running_acquisition';
  next.cloud_controller_intent = null;
  next.updated_at = new Date().toISOString();
  const written = await checkpoint(stub, snapshot, next);
  return { ok: true, executed: true, phase: 'workflow_bound', workflow_id: intent.workflow_id, state_version: written.version, state_sha256: written.sha256, decision };
}

async function inspectActiveWorkflow(env, stub, snapshot, decision) {
  const active = snapshot.state.active_instance;
  if (!active?.id || active.id !== decision.workflow_id || !['discovery', 'acquisition'].includes(active.mode)) throw new Error('ca_controller_active_workflow_mismatch');
  const stale = caActiveWorkflowIsStale(active);
  let instance;
  try {
    instance = await env.GLOBAL_ACQUISITION.get(active.id);
  } catch (error) {
    if (stale) return checkpointRecoveredActiveWorkflow(stub, snapshot, active, `lookup_error:${String(error?.message || error)}`, decision);
    throw error;
  }
  if (!instance || typeof instance.status !== 'function') {
    if (stale) return checkpointRecoveredActiveWorkflow(stub, snapshot, active, 'lookup_failed', decision);
    throw new Error('ca_controller_active_workflow_lookup_failed');
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
  if (result.country !== 'CA') throw new Error('ca_controller_workflow_country_mismatch');
  const next = structuredClone(snapshot.state);
  next.active_instance = null;
  appendResult(next, { workflow_id: active.id, mode: active.mode, completed_at: new Date().toISOString(), result });

  if (active.mode === 'discovery') {
    if (result.mode !== 'ca_source_discovery_pr') throw new Error('ca_controller_discovery_output_mismatch');
    const previousOffset = Number(active.query_offset || snapshot.state.query_offset || 0);
    const nextOffset = Number(result.next_query_offset);
    if (!Number.isInteger(nextOffset) || nextOffset < 0 || nextOffset >= CA_DISCOVERY_PLAN_SIZE) throw new Error('ca_controller_next_query_offset_invalid');
    next.query_offset = nextOffset;
    if (nextOffset <= previousOffset && Number(result.query_count || 0) > 0) next.cycle = Number(next.cycle || 0) + 1;
    next.totals.discovery_runs = Number(next.totals?.discovery_runs || 0) + 1;
    next.totals.source_additions = Number(next.totals?.source_additions || 0) + Number(result.source_additions || 0);
    next.last_discovery = { workflow_id: active.id, result };
    const prNumber = Number(result?.source_pr?.pr_number || 0);
    if (Number(result.source_additions || 0) > 0 && prNumber > 0) {
      next.pending_source_pr = {
        pr_number: prNumber,
        workflow_id: active.id,
        source_ids: Array.isArray(result.source_ids) ? [...result.source_ids] : []
      };
      next.status = 'reviewing_source_pr';
    } else {
      next.status = 'ready_acquisition';
    }
  } else {
    if (result.mode !== 'ca_additions_only_pr') throw new Error('ca_controller_acquisition_output_mismatch');
    next.totals.acquisition_runs = Number(next.totals?.acquisition_runs || 0) + 1;
    next.totals.opportunity_additions = Number(next.totals?.opportunity_additions || 0) + Number(result.manifest_additions || 0);
    next.last_acquisition = { workflow_id: active.id, result };
    const prNumber = Number(result?.opportunity_pr?.pr_number || 0);
    if (Number(result.manifest_additions || 0) > 0 && prNumber > 0) {
      next.pending_data_pr = {
        pr_number: prNumber,
        workflow_id: active.id,
        opportunity_ids: Array.isArray(result.opportunity_ids) ? [...result.opportunity_ids] : []
      };
      next.status = 'reviewing_data_pr';
    } else {
      next.status = 'ready_discovery';
    }
  }

  next.updated_at = new Date().toISOString();
  const written = await checkpoint(stub, snapshot, next);
  return { ok: true, executed: true, phase: 'workflow_completed', workflow_id: active.id, workflow_status: status, next_status: next.status, state_version: written.version, state_sha256: written.sha256, decision };
}

async function reserveSourcePrMerge(env, stub, snapshot, decision) {
  const result = snapshot.state.last_discovery?.result;
  if (!result) throw new Error('ca_controller_source_result_missing');
  const pr = await inspectCaControllerPr(env, decision.pr_number);
  const validated = validateCaSourcePr(result, pr);
  if (!validated.ready) {
    return { ok: true, executed: false, phase: 'source_pr_checks_pending', pr_number: decision.pr_number, state_version: snapshot.version, state_sha256: snapshot.sha256, decision };
  }
  return reservePrMerge(stub, snapshot, decision, validated, 'source');
}

async function reserveDataPrMerge(env, stub, snapshot, decision) {
  const result = snapshot.state.last_acquisition?.result;
  if (!result) throw new Error('ca_controller_data_result_missing');
  const validated = await inspectAndValidateCaDataPr(env, result, decision.pr_number);
  if (!validated.ready) {
    return { ok: true, executed: false, phase: 'data_pr_checks_pending', pr_number: decision.pr_number, state_version: snapshot.version, state_sha256: snapshot.sha256, decision };
  }
  return reservePrMerge(stub, snapshot, decision, validated, 'data');
}

async function reservePrMerge(stub, snapshot, decision, validated, kind) {
  const next = structuredClone(snapshot.state);
  next.cloud_controller_intent = {
    phase: 'reserved',
    action: kind === 'source' ? 'merge_source_pr' : 'merge_data_pr',
    pr_number: validated.pr_number,
    head_sha: validated.head_sha,
    base_sha: validated.base_sha,
    additions: validated.additions,
    ...(kind === 'source'
      ? { source_ids: [...validated.source_ids] }
      : { before: validated.before, after: validated.after, opportunity_ids: [...validated.opportunity_ids] }),
    reserved_from_version: snapshot.version,
    reserved_from_sha256: snapshot.sha256,
    reserved_at: new Date().toISOString()
  };
  next.updated_at = new Date().toISOString();
  const written = await checkpoint(stub, snapshot, next);
  return { ok: true, executed: true, phase: `${kind}_pr_merge_reserved`, pr_number: validated.pr_number, state_version: written.version, state_sha256: written.sha256, decision };
}

async function mergeReservedPr(env, stub, snapshot, decision, kind) {
  const intent = snapshot.state.cloud_controller_intent;
  const action = kind === 'source' ? 'merge_source_pr' : 'merge_data_pr';
  if (!intent || intent.phase !== 'reserved' || intent.action !== action || Number(intent.pr_number) !== Number(decision.pr_number)) {
    throw new Error(`ca_controller_reserved_${kind}_pr_changed`);
  }
  const merged = kind === 'source'
    ? await mergeCaControllerPr(env, { pr_number: intent.pr_number, head_sha: intent.head_sha })
    : await mergeValidatedCaDataPr(env, { pr_number: intent.pr_number, head_sha: intent.head_sha });
  const next = structuredClone(snapshot.state);
  next.cloud_controller_intent = null;
  next.status = kind === 'source' ? 'waiting_source_deploy' : 'waiting_frontend_deploy';
  next.pending_deployment = {
    kind,
    pr_number: Number(intent.pr_number),
    merge_sha: merged.merge_sha,
    additions: Number(intent.additions || 0),
    ...(kind === 'source'
      ? { source_ids: Array.isArray(intent.source_ids) ? [...intent.source_ids] : [] }
      : {
          before: Number(intent.before),
          after: Number(intent.after),
          opportunity_ids: Array.isArray(intent.opportunity_ids) ? [...intent.opportunity_ids] : []
        }),
    merged_at: new Date().toISOString()
  };
  next.updated_at = new Date().toISOString();
  const written = await checkpoint(stub, snapshot, next);
  return { ok: true, executed: true, phase: `${kind}_pr_merged`, pr_number: Number(intent.pr_number), merge_sha: merged.merge_sha, state_version: written.version, state_sha256: written.sha256, decision };
}

async function verifySourceDeploy(env, stub, snapshot, decision) {
  const pending = snapshot.state.pending_deployment;
  if (!pending || pending.kind !== 'source' || pending.merge_sha !== decision.merge_sha) throw new Error('ca_controller_source_deployment_mismatch');
  const checks = await inspectCaMergeChecks(env, pending.merge_sha, SOURCE_DEPLOY_CHECKS);
  if (!checks.ready) {
    return { ok: true, executed: false, phase: 'source_deploy_checks_pending', pending: checks.pending, state_version: snapshot.version, state_sha256: snapshot.sha256, decision };
  }
  const base = await readCanadaBases(env);
  const additions = Number(pending.additions || 0);
  if (base.sourceCount !== Number(snapshot.state.source_count || 0) + additions) throw new Error('ca_controller_source_registry_count_mismatch_after_merge');

  const next = structuredClone(snapshot.state);
  next.source_count = base.sourceCount;
  next.base_main_sha = base.mainSha;
  next.totals.source_prs_merged = Number(next.totals?.source_prs_merged || 0) + 1;
  next.pending_source_pr = null;
  next.pending_deployment = null;
  next.status = 'ready_acquisition';
  next.updated_at = new Date().toISOString();
  const written = await checkpoint(stub, snapshot, next);
  return { ok: true, executed: true, phase: 'source_deploy_verified', next_status: next.status, source_count: next.source_count, state_version: written.version, state_sha256: written.sha256, decision };
}

async function verifyFrontendDeploy(env, stub, snapshot, decision) {
  const pending = snapshot.state.pending_deployment;
  if (!pending || pending.kind !== 'data' || pending.merge_sha !== decision.merge_sha) throw new Error('ca_controller_frontend_deployment_mismatch');
  const checks = await inspectCaFrontendDeployment(env, pending.merge_sha);
  if (!checks.ready) {
    return { ok: true, executed: false, phase: 'frontend_deploy_checks_pending', pending: checks.pending, state_version: snapshot.version, state_sha256: snapshot.sha256, decision };
  }
  const base = await readCanadaBases(env);
  const before = Number(pending.before);
  const after = Number(pending.after);
  const additions = Number(pending.additions || 0);
  if (!Number.isInteger(before) || !Number.isInteger(after) || after !== before + additions) throw new Error('ca_controller_data_pending_delta_invalid');
  if (before !== Number(snapshot.state.production_count || 0) || base.productionCount !== after) throw new Error('ca_controller_production_count_mismatch_after_merge');

  const next = structuredClone(snapshot.state);
  next.production_count = base.productionCount;
  next.base_main_sha = base.mainSha;
  next.totals.data_prs_merged = Number(next.totals?.data_prs_merged || 0) + 1;
  next.pending_data_pr = null;
  next.pending_deployment = null;
  next.status = 'ready_discovery';
  next.updated_at = new Date().toISOString();
  const written = await checkpoint(stub, snapshot, next);
  return { ok: true, executed: true, phase: 'frontend_deploy_verified', next_status: next.status, production_count: next.production_count, state_version: written.version, state_sha256: written.sha256, decision };
}

export async function runCaCloudControllerTick(env, { execute = false } = {}) {
  const stub = caControllerStateStub(env);
  let snapshot = await readSnapshot(stub);
  let initialized = false;
  if (!snapshot) {
    snapshot = await initializeShadowState(env, stub);
    initialized = true;
  }
  const decision = caControllerDecision(snapshot.state);
  const cutoverEnabled = globalCaControllerCutoverEnabled(env);
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

  if (decision.action === 'start_discovery') return reserveWorkflow(stub, snapshot, decision, 'discovery');
  if (decision.action === 'bind_reserved_discovery') return bindReservedWorkflow(env, stub, snapshot, decision, 'discovery');
  if (decision.action === 'start_acquisition') return reserveWorkflow(stub, snapshot, decision, 'acquisition');
  if (decision.action === 'bind_reserved_acquisition') return bindReservedWorkflow(env, stub, snapshot, decision, 'acquisition');
  if (decision.action === 'inspect_active_workflow') return inspectActiveWorkflow(env, stub, snapshot, decision);
  if (decision.action === 'review_source_pr') return reserveSourcePrMerge(env, stub, snapshot, decision);
  if (decision.action === 'merge_reserved_source_pr') return mergeReservedPr(env, stub, snapshot, decision, 'source');
  if (decision.action === 'verify_source_deploy') return verifySourceDeploy(env, stub, snapshot, decision);
  if (decision.action === 'review_data_pr') return reserveDataPrMerge(env, stub, snapshot, decision);
  if (decision.action === 'merge_reserved_data_pr') return mergeReservedPr(env, stub, snapshot, decision, 'data');
  if (decision.action === 'verify_frontend_deploy') return verifyFrontendDeploy(env, stub, snapshot, decision);
  if (decision.action === 'blocked' || decision.action === 'await_implementation') {
    return { ok: true, executed: false, phase: decision.action, state_version: snapshot.version, state_sha256: snapshot.sha256, decision };
  }
  throw new Error(`ca_controller_action_unsupported:${decision.action || 'unknown'}`);
}

export { CA_QUERY_LIMIT, CA_ACTIVE_WORKFLOW_STALE_MS, CA_SNAPSHOT_PATH, CA_SOURCE_REGISTRY_PATH, SOURCE_DEPLOY_CHECKS };
