import { githubJson } from './github-publication.mjs';
import { parseAcquisitionSnapshotModule } from '../../../platform/acquisition/global-engine.mjs';
import { CA_DISCOVERY_PLAN_SIZE } from './ca-source-discovery-plan.mjs';

const CA_QUERY_LIMIT = 4;
const CA_SNAPSHOT_PATH = 'functions/_data/ca-opportunities.mjs';
const CA_SOURCE_REGISTRY_PATH = 'operations/opportunity-pipeline/config/ca-approved-source-routes.json';

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

export function caControllerDecision(state) {
  if (!state || state.controller_kind !== 'ca') throw new Error('ca_controller_state_invalid');
  if (state.active_instance?.id) return { action: 'inspect_active_workflow', workflow_id: state.active_instance.id, mode: state.active_instance.mode };
  if (state.cloud_controller_intent?.phase === 'reserved') return { action: 'reserved_intent', intent: state.cloud_controller_intent.action || 'unknown' };
  if (state.status === 'ready_discovery') return {
    action: 'start_discovery',
    query_offset: Number(state.query_offset || 0),
    query_limit: Number(state.query_limit || CA_QUERY_LIMIT),
    cycle: Number(state.cycle || 0)
  };
  if (state.status === 'ready_acquisition') return { action: 'start_acquisition', cycle: Number(state.cycle || 0) };
  if (state.status === 'blocked') return { action: 'blocked', reason: state.blocker || 'unknown' };
  return { action: 'await_implementation', status: state.status };
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
  throw new Error('ca_controller_execution_not_armed');
}

export { CA_QUERY_LIMIT, CA_SNAPSHOT_PATH, CA_SOURCE_REGISTRY_PATH };
