import {
  acquisitionReplayProvenanceReady,
  assertControllerCutoverPreflightReady,
  pendingDeferredAcquisitionUnits
} from './controller-cutover-preflight.mjs';

function sha64(value) {
  const text = String(value || '').trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(text) ? text : null;
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
  const replayInflight = Boolean(state.deferred_replay_inflight);
  const structurallyEligible = authority === 'shadow' && !replayInflight && unproven.length === 0 && markerReady;

  return Object.freeze({
    authority,
    state_version: Number.isInteger(version) && version > 0 ? version : null,
    state_sha256: stateSha256,
    state_status: String(state.status || 'unknown'),
    deferred_replay_inflight: replayInflight,
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
