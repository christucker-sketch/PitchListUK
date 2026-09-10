import { globalControllerCutoverEnabled } from './controller-authority-guard.mjs';
import { readControllerCutoverReadinessReport } from './controller-cutover-readiness.mjs';
import { globalControllerExecutionLevel } from './dispatch.mjs';

export const STALE_AUTHORITY_RECOVERY_MODE = 'recover_stale_hal_authority_v12';

export const STALE_AUTHORITY_RECOVERY_TARGET = Object.freeze({
  state_version: 12,
  state_sha256: 'bab094984c928a20db4ee6dfd929a9e94e066cae9ad7baa76b84820c945a754b',
  state_source: 'hal-us-growth',
  state_imported_at: '2026-09-10T11:51:53.692Z',
  state_updated_at: '2026-09-10T11:50:53.898Z',
  state_status: 'running_cloudflare_discovery',
  current_state_code: 'MI',
  current_mode: 'discover',
  active_instance_id: 'cf_d9de4e04c49d1ad3d02156da21d02d30db1f0bbb60c0e0185ebee0c8eef41fe5',
  deferred_replay_inflight_key: 'discover:MI:128:4',
  deferred_replay_inflight_mode: 'discover',
  deferred_replay_inflight_state_code: 'MI'
});

function mismatch(name, actual, expected) {
  throw new Error(`stale_authority_recovery_identity_mismatch:${name}:${String(actual)}:${String(expected)}`);
}

export function assertStaleAuthorityRecoveryTarget(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    throw new Error('stale_authority_recovery_report_invalid');
  }
  for (const [field, expected] of Object.entries(STALE_AUTHORITY_RECOVERY_TARGET)) {
    if (report[field] !== expected) mismatch(field, report[field], expected);
  }
  if (report.deferred_replay_inflight !== true) {
    mismatch('deferred_replay_inflight', report.deferred_replay_inflight, true);
  }
  if (report.deferred_acquisition_replay_count !== 0) {
    mismatch('deferred_acquisition_replay_count', report.deferred_acquisition_replay_count, 0);
  }
  if (!['authoritative', 'shadow'].includes(report.authority)) {
    throw new Error(`stale_authority_recovery_authority_invalid:${String(report.authority)}`);
  }
  return report;
}

function controllerStateStub(env) {
  if (!env?.CONTROLLER_STATE) throw new Error('controller_state_binding_missing');
  return env.CONTROLLER_STATE.get(env.CONTROLLER_STATE.idFromName('us-controller'));
}

export async function recoverStaleHalAuthorityV12(env = {}) {
  if (globalControllerCutoverEnabled(env)) {
    throw new Error('stale_authority_recovery_requires_cutover_disabled');
  }
  if (globalControllerExecutionLevel(env) !== 'read_only') {
    throw new Error('stale_authority_recovery_requires_read_only_execution');
  }

  const before = assertStaleAuthorityRecoveryTarget(await readControllerCutoverReadinessReport(env));
  if (before.authority === 'shadow') {
    return Object.freeze({
      ok: true,
      recovered: true,
      changed: false,
      reason: 'already_shadow',
      state_version: before.state_version,
      state_sha256: before.state_sha256,
      authority: before.authority,
      state_source: before.state_source
    });
  }

  const response = await controllerStateStub(env).fetch(new Request('https://controller-state.internal/demote', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      expected_version: STALE_AUTHORITY_RECOVERY_TARGET.state_version,
      expected_sha256: STALE_AUTHORITY_RECOVERY_TARGET.state_sha256
    })
  }));
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok !== true) {
    throw new Error(`stale_authority_recovery_demote_failed:${response.status}:${String(payload?.error || 'unknown')}`);
  }

  const after = assertStaleAuthorityRecoveryTarget(await readControllerCutoverReadinessReport(env));
  if (after.authority !== 'shadow') {
    throw new Error(`stale_authority_recovery_postcondition_failed:${String(after.authority)}`);
  }
  if (after.state_version !== before.state_version || after.state_sha256 !== before.state_sha256) {
    throw new Error('stale_authority_recovery_snapshot_changed');
  }

  return Object.freeze({
    ok: true,
    recovered: true,
    changed: payload?.changed === true,
    reason: 'exact_stale_authority_demoted',
    state_version: after.state_version,
    state_sha256: after.state_sha256,
    authority: after.authority,
    state_source: after.state_source
  });
}
