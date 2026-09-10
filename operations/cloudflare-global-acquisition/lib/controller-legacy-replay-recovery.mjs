import { globalControllerCutoverEnabled } from './controller-authority-guard.mjs';
import { readControllerCutoverReadinessReport } from './controller-cutover-readiness.mjs';
import { globalControllerExecutionLevel } from './dispatch.mjs';
import { deferredUnitKey } from '../../cloudflare-texas-acquisition/scripts/growth-controller-integrity.mjs';

export const FAILED_LEGACY_REPLAY_RECOVERY_MODE = 'recover_failed_legacy_mi_replay';

export const FAILED_LEGACY_REPLAY_TARGET = Object.freeze({
  controller_state_version: 12,
  controller_state_sha256: 'bab094984c928a20db4ee6dfd929a9e94e066cae9ad7baa76b84820c945a754b',
  controller_state_source: 'hal-us-growth',
  controller_state_imported_at: '2026-09-10T11:51:53.692Z',
  workflow_name: 'pitchlist-texas-acquisition',
  instance_id: 'cf_d9de4e04c49d1ad3d02156da21d02d30db1f0bbb60c0e0185ebee0c8eef41fe5',
  state_code: 'MI',
  mode: 'discover',
  query_offset: 128,
  query_limit: 4,
  replay_key: 'discover:MI:128:4',
  workflow_status: 'errored',
  workflow_error_name: 'SyntaxError',
  workflow_error_message: 'Unexpected end of JSON input',
  workflow_start: '2026-09-10T11:50:53.850Z',
  workflow_end: '2026-09-10T11:52:41.408Z'
});

function exact(value, expected, error) {
  if (value !== expected) throw new Error(error);
}

export function recoverFailedLegacyReplayState(state, now = new Date()) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('legacy_replay_recovery_state_invalid');
  exact(state.status, 'running_cloudflare_discovery', 'legacy_replay_recovery_status_mismatch');
  exact(state.current?.state_code, FAILED_LEGACY_REPLAY_TARGET.state_code, 'legacy_replay_recovery_current_state_mismatch');
  exact(state.current?.mode, FAILED_LEGACY_REPLAY_TARGET.mode, 'legacy_replay_recovery_current_mode_mismatch');
  exact(Number(state.current?.query_offset), FAILED_LEGACY_REPLAY_TARGET.query_offset, 'legacy_replay_recovery_current_offset_mismatch');
  exact(Number(state.current?.query_limit), FAILED_LEGACY_REPLAY_TARGET.query_limit, 'legacy_replay_recovery_current_limit_mismatch');
  exact(state.active_instance?.id, FAILED_LEGACY_REPLAY_TARGET.instance_id, 'legacy_replay_recovery_active_instance_mismatch');
  exact(state.active_instance?.mode, FAILED_LEGACY_REPLAY_TARGET.mode, 'legacy_replay_recovery_active_mode_mismatch');
  exact(state.active_instance?.state_code, FAILED_LEGACY_REPLAY_TARGET.state_code, 'legacy_replay_recovery_active_state_mismatch');

  const inflight = state.deferred_replay_inflight;
  if (!inflight) throw new Error('legacy_replay_recovery_inflight_missing');
  exact(inflight.key || deferredUnitKey(inflight), FAILED_LEGACY_REPLAY_TARGET.replay_key, 'legacy_replay_recovery_inflight_key_mismatch');
  exact(inflight.mode, FAILED_LEGACY_REPLAY_TARGET.mode, 'legacy_replay_recovery_inflight_mode_mismatch');
  exact(inflight.state_code, FAILED_LEGACY_REPLAY_TARGET.state_code, 'legacy_replay_recovery_inflight_state_mismatch');
  exact(Number(inflight.query_offset), FAILED_LEGACY_REPLAY_TARGET.query_offset, 'legacy_replay_recovery_inflight_offset_mismatch');
  exact(Number(inflight.query_limit), FAILED_LEGACY_REPLAY_TARGET.query_limit, 'legacy_replay_recovery_inflight_limit_mismatch');

  const deferred = Array.isArray(state.deferred_units) ? state.deferred_units : [];
  const matches = deferred.filter(unit => deferredUnitKey(unit) === FAILED_LEGACY_REPLAY_TARGET.replay_key);
  if (matches.length !== 1) throw new Error(`legacy_replay_recovery_deferred_unit_count:${matches.length}`);
  const queued = matches[0];
  exact(queued.disposition, 'deferred_for_replay', 'legacy_replay_recovery_deferred_disposition_mismatch');
  exact(queued.mode, FAILED_LEGACY_REPLAY_TARGET.mode, 'legacy_replay_recovery_deferred_mode_mismatch');
  exact(queued.state_code, FAILED_LEGACY_REPLAY_TARGET.state_code, 'legacy_replay_recovery_deferred_state_mismatch');
  exact(Number(queued.query_offset), FAILED_LEGACY_REPLAY_TARGET.query_offset, 'legacy_replay_recovery_deferred_offset_mismatch');
  exact(Number(queued.query_limit), FAILED_LEGACY_REPLAY_TARGET.query_limit, 'legacy_replay_recovery_deferred_limit_mismatch');
  if (Number(queued.replay_attempts || 0) < 1) throw new Error('legacy_replay_recovery_deferred_attempt_missing');
  if (Number(inflight.replay_attempts || 0) !== Number(queued.replay_attempts || 0)) throw new Error('legacy_replay_recovery_attempt_mismatch');

  const order = Array.isArray(state.priority_order) ? state.priority_order : [];
  const priorityIndex = order.indexOf(FAILED_LEGACY_REPLAY_TARGET.state_code);
  if (priorityIndex < 0) throw new Error('legacy_replay_recovery_priority_state_missing');

  const next = structuredClone(state);
  next.legacy_replay_recoveries = Array.isArray(next.legacy_replay_recoveries) ? next.legacy_replay_recoveries : [];
  next.legacy_replay_recoveries.push({
    replay_key: FAILED_LEGACY_REPLAY_TARGET.replay_key,
    workflow_name: FAILED_LEGACY_REPLAY_TARGET.workflow_name,
    instance_id: FAILED_LEGACY_REPLAY_TARGET.instance_id,
    workflow_status: FAILED_LEGACY_REPLAY_TARGET.workflow_status,
    workflow_error: {
      name: FAILED_LEGACY_REPLAY_TARGET.workflow_error_name,
      message: FAILED_LEGACY_REPLAY_TARGET.workflow_error_message
    },
    workflow_start: FAILED_LEGACY_REPLAY_TARGET.workflow_start,
    workflow_end: FAILED_LEGACY_REPLAY_TARGET.workflow_end,
    disposition: 'returned_to_deferred_queue',
    recovered_at: now.toISOString()
  });
  if (next.legacy_replay_recoveries.length > 100) next.legacy_replay_recoveries.splice(0, next.legacy_replay_recoveries.length - 100);

  next.active_instance = null;
  next.deferred_replay_inflight = null;
  next.query_offsets = { ...(next.query_offsets || {}), [FAILED_LEGACY_REPLAY_TARGET.state_code]: FAILED_LEGACY_REPLAY_TARGET.query_offset };
  next.priority_cursor = priorityIndex;
  next.current = null;
  next.pending_source_ids = [];
  next.acquisition_batch = 1;
  next.status = 'ready';
  delete next.cloud_controller_intent;
  delete next.cloud_controller_cutover_preflight;
  next.updated_at = now.toISOString();

  return Object.freeze({
    next_state: next,
    replay_key: FAILED_LEGACY_REPLAY_TARGET.replay_key,
    replay_attempts: Number(queued.replay_attempts || 0)
  });
}

export function legacyReplayRecoveryAlreadyApplied(state, meta = {}) {
  if (meta.authority !== 'shadow' || meta.source !== 'cloudflare-us-controller-legacy-recovery') return false;
  if (state?.deferred_replay_inflight || state?.active_instance || state?.status !== 'ready') return false;
  const recoveries = Array.isArray(state?.legacy_replay_recoveries) ? state.legacy_replay_recoveries : [];
  return recoveries.some(item => item?.instance_id === FAILED_LEGACY_REPLAY_TARGET.instance_id && item?.replay_key === FAILED_LEGACY_REPLAY_TARGET.replay_key && item?.disposition === 'returned_to_deferred_queue');
}

function stateStub(env) {
  if (!env?.CONTROLLER_STATE) throw new Error('controller_state_binding_missing');
  return env.CONTROLLER_STATE.get(env.CONTROLLER_STATE.idFromName('us-controller'));
}

export async function recoverFailedLegacyReplay(env = {}) {
  if (globalControllerCutoverEnabled(env)) throw new Error('legacy_replay_recovery_requires_cutover_disabled');
  if (globalControllerExecutionLevel(env) !== 'read_only') throw new Error('legacy_replay_recovery_requires_read_only_execution');

  const response = await stateStub(env).fetch(new Request('https://controller-state.internal/recover-failed-legacy-replay', { method: 'POST' }));
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok !== true) throw new Error(`legacy_replay_recovery_failed:${response.status}:${String(payload?.error || 'unknown')}`);

  const report = await readControllerCutoverReadinessReport(env);
  if (report.authority !== 'shadow') throw new Error('legacy_replay_recovery_postcondition_authority');
  if (report.state_source !== 'cloudflare-us-controller-legacy-recovery') throw new Error('legacy_replay_recovery_postcondition_source');
  if (report.deferred_replay_inflight !== false || report.active_instance_id !== null) throw new Error('legacy_replay_recovery_postcondition_inflight');
  if (report.state_status !== 'ready') throw new Error('legacy_replay_recovery_postcondition_status');

  return Object.freeze({
    ok: true,
    recovered: true,
    changed: payload.changed === true,
    reason: payload.changed === true ? 'failed_legacy_replay_returned_to_queue' : 'already_recovered',
    replay_key: FAILED_LEGACY_REPLAY_TARGET.replay_key,
    state_version: report.state_version,
    state_sha256: report.state_sha256,
    authority: report.authority,
    state_source: report.state_source,
    state_status: report.state_status,
    deferred_replay_inflight: report.deferred_replay_inflight
  });
}
