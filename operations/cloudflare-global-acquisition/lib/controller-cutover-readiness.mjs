import {
  acquisitionReplayProvenanceReady,
  assertControllerCutoverPreflightReady,
  pendingDeferredAcquisitionUnits
} from './controller-cutover-preflight.mjs';

function sha64(value) {
  const text = String(value || '').trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(text) ? text : null;
}

function optionalString(value) {
  const text = String(value || '').trim();
  return text || null;
}

export function buildControllerCutoverReadinessReport(state, meta = {}) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('cutover_readiness_state_invalid');
  const units = pendingDeferredAcquisitionUnits(state);
  const unproven = units.filter(unit => !acquisitionReplayProvenanceReady(unit));
  let markerReady = false;
  let markerError = null;
  try {
    assertControllerCutoverPreflightReady(state);
    markerReady = true;
  } catch (error) {
    markerError = String(error?.message || error);
  }

  const authority = String(meta.authority || 'unknown');
  const version = Number(meta.version || 0);
  const stateSha256 = sha64(meta.sha256);
  const replay = state.deferred_replay_inflight || null;
  const replayInflight = Boolean(replay);
  const structurallyEligible = authority === 'shadow' && !replayInflight && unproven.length === 0 && markerReady;

  return Object.freeze({
    authority,
    state_version: Number.isInteger(version) && version > 0 ? version : null,
    state_sha256: stateSha256,
    state_source: optionalString(meta.source),
    state_imported_at: optionalString(meta.imported_at),
    state_updated_at: optionalString(state.updated_at),
    state_status: String(state.status || 'unknown'),
    current_state_code: optionalString(state.current?.state_code),
    current_mode: optionalString(state.current?.mode),
    active_instance_id: optionalString(state.active_instance?.id),
    deferred_replay_inflight: replayInflight,
    deferred_replay_inflight_key: optionalString(replay?.key),
    deferred_replay_inflight_mode: optionalString(replay?.mode),
    deferred_replay_inflight_state_code: optionalString(replay?.state_code),
    deferred_acquisition_replay_count: units.length,
    deferred_acquisition_replay_proven_count: units.length - unproven.length,
    deferred_acquisition_replay_unproven_count: unproven.length,
    preflight_marker_ready: markerReady,
    preflight_marker_error: markerError,
    promotion_structurally_eligible: structurallyEligible,
    promotion_blockers: [
      ...(authority === 'shadow' ? [] : [`authority:${authority}`]),
      ...(replayInflight ? ['deferred_replay_inflight'] : []),
      ...(unproven.length ? [`unproven_deferred_acquisition_replays:${unproven.length}`] : []),
      ...(markerReady ? [] : [`preflight_marker:${markerError || 'invalid'}`])
    ]
  });
}

export async function readControllerCutoverReadinessReport(env) {
  if (!env?.CONTROLLER_STATE) throw new Error('controller_state_binding_missing');
  const id = env.CONTROLLER_STATE.idFromName('us-controller');
  const stub = env.CONTROLLER_STATE.get(id);
  const response = await stub.fetch('https://controller-state.internal/snapshot');
  if (!response.ok) throw new Error(`cutover_readiness_snapshot_http_${response.status}`);
  let state;
  try {
    state = JSON.parse(await response.text());
  } catch {
    throw new Error('cutover_readiness_snapshot_invalid_json');
  }
  return buildControllerCutoverReadinessReport(state, {
    authority: response.headers.get('x-findpitches-state-authority') || 'unknown',
    version: Number(response.headers.get('x-findpitches-state-version') || 0),
    sha256: response.headers.get('x-findpitches-state-sha256') || '',
    source: response.headers.get('x-findpitches-state-source') || '',
    imported_at: response.headers.get('x-findpitches-state-imported-at') || ''
  });
}
