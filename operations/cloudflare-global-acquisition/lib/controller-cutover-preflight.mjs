import { deferredUnitKey } from '../../cloudflare-texas-acquisition/scripts/growth-controller-integrity.mjs';

function string(value) {
  return String(value ?? '').trim();
}

function sortedStrings(values) {
  return [...(Array.isArray(values) ? values : [])].map(value => string(value)).filter(Boolean).sort();
}

function validSha(value) {
  return /^[a-f0-9]{40}$/i.test(string(value));
}

function validPositiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0;
}

export function pendingDeferredAcquisitionUnits(state) {
  return (Array.isArray(state?.deferred_units) ? state.deferred_units : [])
    .filter(unit => unit?.disposition === 'deferred_for_replay' && unit?.mode === 'acquire');
}

export function acquisitionReplayProvenanceReady(unit) {
  if (!unit || unit.mode !== 'acquire') return false;
  const provenance = unit.replay_source_provenance;
  if (!validPositiveInteger(unit.source_pr) || !provenance) return false;
  if (string(provenance.state_code).toUpperCase() !== string(unit.state_code).toUpperCase()) return false;
  const expectedIds = sortedStrings(unit.source_ids);
  const provenIds = sortedStrings(provenance.source_ids);
  if (!expectedIds.length || JSON.stringify(expectedIds) !== JSON.stringify(provenIds)) return false;
  if (![provenance.main_sha, provenance.registry_blob_sha, provenance.deployment_anchor_sha].every(validSha)) return false;
  if (!validPositiveInteger(provenance.deployment_check_id)) return false;
  return true;
}

export function legacyAcquisitionReplayUnitsNeedingProof(state) {
  return pendingDeferredAcquisitionUnits(state).filter(unit => !acquisitionReplayProvenanceReady(unit));
}

export function stampControllerCutoverPreflight(state, now = new Date()) {
  if (!state || typeof state !== 'object') throw new Error('cutover_preflight_state_missing');
  if (state.deferred_replay_inflight) throw new Error('cutover_preflight_replay_inflight_present');
  const units = pendingDeferredAcquisitionUnits(state);
  const unproven = units.filter(unit => !acquisitionReplayProvenanceReady(unit));
  if (unproven.length) throw new Error(`cutover_preflight_unproven_acquisition_replay:${unproven.length}`);

  const keys = units.map(unit => deferredUnitKey(unit)).filter(Boolean).sort();
  if (keys.length !== units.length || new Set(keys).size !== keys.length) throw new Error('cutover_preflight_replay_key_invalid');
  const nextState = structuredClone(state);
  nextState.cloud_controller_cutover_preflight = {
    status: 'ready',
    acquisition_replay_count: units.length,
    acquisition_replay_keys: keys,
    proven_source_prs: units.map(unit => Number(unit.source_pr)).sort((a, b) => a - b),
    completed_at: now.toISOString()
  };
  nextState.updated_at = now.toISOString();
  return Object.freeze({ next_state: nextState, acquisition_replay_count: units.length, acquisition_replay_keys: keys });
}

export function assertControllerCutoverPreflightReady(state) {
  if (!state || typeof state !== 'object') throw new Error('controller_cutover_preflight_state_missing');
  if (state.deferred_replay_inflight) throw new Error('controller_cutover_preflight_replay_inflight_present');
  const units = pendingDeferredAcquisitionUnits(state);
  const unproven = units.filter(unit => !acquisitionReplayProvenanceReady(unit));
  if (unproven.length) throw new Error(`controller_cutover_preflight_unproven_acquisition_replay:${unproven.length}`);
  const keys = units.map(unit => deferredUnitKey(unit)).filter(Boolean).sort();
  if (keys.length !== units.length || new Set(keys).size !== keys.length) throw new Error('controller_cutover_preflight_replay_key_invalid');

  const marker = state.cloud_controller_cutover_preflight;
  if (!marker || marker.status !== 'ready') throw new Error('controller_cutover_preflight_missing');
  if (Number(marker.acquisition_replay_count) !== units.length) throw new Error('controller_cutover_preflight_count_mismatch');
  const markedKeys = sortedStrings(marker.acquisition_replay_keys);
  if (JSON.stringify(markedKeys) !== JSON.stringify(keys)) throw new Error('controller_cutover_preflight_key_mismatch');
  const sourcePrs = units.map(unit => Number(unit.source_pr)).sort((a, b) => a - b);
  const markedPrs = [...(Array.isArray(marker.proven_source_prs) ? marker.proven_source_prs : [])].map(Number).sort((a, b) => a - b);
  if (JSON.stringify(markedPrs) !== JSON.stringify(sourcePrs)) throw new Error('controller_cutover_preflight_source_pr_mismatch');
  return Object.freeze({ acquisition_replay_count: units.length, acquisition_replay_keys: keys, proven_source_prs: sourcePrs });
}
