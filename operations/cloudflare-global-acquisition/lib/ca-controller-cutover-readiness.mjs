import { CA_DISCOVERY_PLAN_SIZE } from './ca-source-discovery-plan.mjs';
import { readCaProductionBasesViaBroker } from './controller-github-client.mjs';

const PROMOTABLE_STATUSES = new Set(['ready_discovery', 'ready_acquisition']);

function gitSha(value) {
  const text = String(value || '').trim().toLowerCase();
  return /^[a-f0-9]{40}$/.test(text) ? text : null;
}

function sha256(value) {
  const text = String(value || '').trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(text) ? text : null;
}

function cleanCheckpoint(state) {
  return !state?.active_instance
    && !state?.cloud_controller_intent
    && !state?.pending_source_pr
    && !state?.pending_data_pr
    && !state?.pending_deployment;
}

export function globalCaCutoverFlagEnabled(env = {}) {
  return String(env.GLOBAL_CA_CONTROLLER_CUTOVER_ENABLED || '').trim().toLowerCase() === 'true';
}

export async function boundedGithubJson(env, path, timeoutMs = 15000) {
  const repo = String(env?.GITHUB_REPO || '').trim();
  if (!repo) throw new Error('ca_readiness_github_repo_missing');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`ca_readiness_github_timeout:${path}`)), timeoutMs);
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}${path}`, {
      signal: controller.signal,
      headers: {
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'FindPitches-Canada-readiness'
      }
    });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { message: text }; }
    if (!response.ok) throw new Error(`ca_readiness_github_${response.status}:${body?.message || response.statusText}`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

export async function readCaProductionBases(env) {
  const bases = await readCaProductionBasesViaBroker(env);
  const mainSha = gitSha(bases?.main_sha);
  const productionCount = Number(bases?.production_count);
  const sourceCount = Number(bases?.source_count);
  if (!mainSha) throw new Error('ca_cutover_main_sha_invalid');
  if (!Number.isInteger(productionCount) || productionCount < 0) throw new Error('ca_cutover_snapshot_invalid');
  if (!Number.isInteger(sourceCount) || sourceCount < 0) throw new Error('ca_cutover_source_registry_invalid');
  return Object.freeze({
    main_sha: mainSha,
    production_count: productionCount,
    source_count: sourceCount
  });
}

export function buildCaControllerCutoverReadinessReport(state, meta = {}, bases = {}, env = {}) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('ca_cutover_state_invalid');

  const authority = String(meta.authority || 'unknown');
  const stateVersion = Number(meta.version || 0);
  const stateSha256 = sha256(meta.sha256);
  const mainSha = gitSha(bases.main_sha);
  const stateBaseMainSha = gitSha(state.base_main_sha);
  const productionCount = Number(state.production_count);
  const sourceCount = Number(state.source_count);
  const currentProductionCount = Number(bases.production_count);
  const currentSourceCount = Number(bases.source_count);
  const status = String(state.status || 'unknown');
  const planSize = Number(state.plan_size);
  const cutoverEnabled = globalCaCutoverFlagEnabled(env);
  const checkpointClean = cleanCheckpoint(state);
  const statusReady = PROMOTABLE_STATUSES.has(status);
  const controllerKindReady = state.controller_kind === 'ca';
  const planReady = planSize === CA_DISCOVERY_PLAN_SIZE;
  const productionCountMatches = Number.isInteger(productionCount)
    && Number.isInteger(currentProductionCount)
    && productionCount === currentProductionCount;
  const sourceCountMatches = Number.isInteger(sourceCount)
    && Number.isInteger(currentSourceCount)
    && sourceCount === currentSourceCount;
  const liveMainReady = Boolean(mainSha);
  const exactStateIdentityReady = Number.isInteger(stateVersion) && stateVersion > 0 && Boolean(stateSha256);

  const commonBlockers = [
    ...(controllerKindReady ? [] : ['controller_kind']),
    ...(planReady ? [] : [`plan_size:${planSize}`]),
    ...(checkpointClean ? [] : ['checkpoint_not_clean']),
    ...(statusReady ? [] : [`status:${status}`]),
    ...(productionCountMatches ? [] : [`production_count:${productionCount}->${currentProductionCount}`]),
    ...(sourceCountMatches ? [] : [`source_count:${sourceCount}->${currentSourceCount}`]),
    ...(liveMainReady ? [] : ['main_sha']),
    ...(exactStateIdentityReady ? [] : ['state_identity']),
    ...(cutoverEnabled ? ['cutover_already_enabled'] : [])
  ];

  const commonReady = commonBlockers.length === 0;
  const promotionReady = commonReady && authority === 'shadow';
  const launchReady = commonReady && authority === 'authoritative';

  return Object.freeze({
    country: 'CA',
    authority,
    cutover_enabled: cutoverEnabled,
    state_version: Number.isInteger(stateVersion) && stateVersion > 0 ? stateVersion : null,
    state_sha256: stateSha256,
    state_source: String(meta.source || '') || null,
    state_imported_at: String(meta.imported_at || '') || null,
    state_status: status,
    controller_kind: String(state.controller_kind || ''),
    plan_size: Number.isFinite(planSize) ? planSize : null,
    expected_plan_size: CA_DISCOVERY_PLAN_SIZE,
    clean_checkpoint: checkpointClean,
    current_main_sha: mainSha,
    state_base_main_sha: stateBaseMainSha,
    state_base_matches_current_main: Boolean(mainSha && stateBaseMainSha && mainSha === stateBaseMainSha),
    state_production_count: Number.isInteger(productionCount) ? productionCount : null,
    current_production_count: Number.isInteger(currentProductionCount) ? currentProductionCount : null,
    production_count_matches: productionCountMatches,
    state_source_count: Number.isInteger(sourceCount) ? sourceCount : null,
    current_source_count: Number.isInteger(currentSourceCount) ? currentSourceCount : null,
    source_count_matches: sourceCountMatches,
    promotion_ready: promotionReady,
    launch_ready: launchReady,
    promotion_blockers: [
      ...commonBlockers,
      ...(authority === 'shadow' ? [] : [`authority:${authority}`])
    ],
    launch_blockers: [
      ...commonBlockers,
      ...(authority === 'authoritative' ? [] : [`authority:${authority}`])
    ]
  });
}

export async function readCaControllerCutoverReadinessReport(env) {
  if (!env?.CA_CONTROLLER_STATE) throw new Error('ca_controller_state_binding_missing');
  const stub = env.CA_CONTROLLER_STATE.get(env.CA_CONTROLLER_STATE.idFromName('ca-controller'));
  const [response, bases] = await Promise.all([
    stub.fetch('https://ca-controller-state.internal/snapshot'),
    readCaProductionBases(env)
  ]);
  if (!response.ok) throw new Error(`ca_cutover_snapshot_http_${response.status}`);

  let state;
  try { state = JSON.parse(await response.text()); }
  catch { throw new Error('ca_cutover_snapshot_invalid_json'); }

  return buildCaControllerCutoverReadinessReport(state, {
    authority: response.headers.get('x-findpitches-state-authority') || 'unknown',
    version: Number(response.headers.get('x-findpitches-state-version') || 0),
    sha256: response.headers.get('x-findpitches-state-sha256') || '',
    source: response.headers.get('x-findpitches-state-source') || '',
    imported_at: response.headers.get('x-findpitches-state-imported-at') || ''
  }, bases, env);
}
