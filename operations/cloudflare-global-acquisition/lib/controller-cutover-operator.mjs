import { controllerStateStub } from './controller-state-maintenance.mjs';
import { buildControllerCutoverReadinessReport } from './controller-cutover-readiness.mjs';
import { globalControllerCutoverEnabled } from './controller-authority-guard.mjs';
import { globalControllerExecutionLevel } from './dispatch.mjs';

export const CUTOVER_OPERATOR_MODE = 'operator_promote_exact_v14';
export const ROLLBACK_OPERATOR_MODE = 'operator_demote_current_authoritative';
export const CUTOVER_CONFIRMATION = 'CUTOVER_US_CONTROLLER_FROM_HAL_TO_CLOUDFLARE';
export const HAL_QUIESCED_CONFIRMATION = 'HAL_US_GROWTH_STOPPED_AND_DISABLED';
export const ROLLBACK_CONFIRMATION = 'ROLLBACK_US_CONTROLLER_TO_SHADOW';

export const EXACT_V14 = Object.freeze({
  version: 14,
  sha256: '23848852c67dd091513d8c26af75e8e7bd55a21d13cfe05739396cd46f2b4dec',
  source: 'cloudflare-us-controller-preflight'
});

function assertSafeOperatorPolicy(env) {
  const executionLevel = globalControllerExecutionLevel(env);
  const cutoverEnabled = globalControllerCutoverEnabled(env);
  if (executionLevel !== 'read_only') throw new Error(`cutover_operator_requires_read_only_execution:${executionLevel}`);
  if (cutoverEnabled) throw new Error('cutover_operator_requires_cutover_disabled');
  return { execution_level: executionLevel, cutover_enabled: false };
}

async function readSnapshot(stub) {
  const response = await stub.fetch('https://controller-state.internal/snapshot');
  if (!response.ok) throw new Error(`controller_snapshot_read_failed:${response.status}`);
  const text = await response.text();
  let state;
  try { state = JSON.parse(text); }
  catch { throw new Error('controller_snapshot_invalid_json'); }
  return {
    state,
    meta: {
      version: Number(response.headers.get('x-findpitches-state-version') || 0),
      sha256: String(response.headers.get('x-findpitches-state-sha256') || '').toLowerCase(),
      authority: String(response.headers.get('x-findpitches-state-authority') || 'unknown'),
      source: String(response.headers.get('x-findpitches-state-source') || 'unknown')
    }
  };
}

function assertExactPromotionCandidate(snapshot) {
  const { state, meta } = snapshot;
  if (meta.version !== EXACT_V14.version) throw new Error(`cutover_operator_version_drift:${meta.version}`);
  if (meta.sha256 !== EXACT_V14.sha256) throw new Error(`cutover_operator_sha_drift:${meta.sha256}`);
  if (meta.source !== EXACT_V14.source) throw new Error(`cutover_operator_source_drift:${meta.source}`);
  if (meta.authority !== 'shadow') throw new Error(`cutover_operator_requires_shadow_authority:${meta.authority}`);

  const readiness = buildControllerCutoverReadinessReport(state, meta);
  if (!readiness.preflight_marker_ready) throw new Error(`cutover_operator_preflight_not_ready:${readiness.preflight_marker_error || 'unknown'}`);
  if (!readiness.promotion_structurally_eligible || readiness.promotion_blockers.length) {
    throw new Error(`cutover_operator_not_structurally_eligible:${readiness.promotion_blockers.join(',')}`);
  }
  return readiness;
}

export async function promoteExactV14(env, payload = {}) {
  const policy = assertSafeOperatorPolicy(env);
  if (String(payload.confirmation || '') !== CUTOVER_CONFIRMATION) throw new Error('cutover_operator_confirmation_required');
  if (String(payload.hal_quiesced_confirmation || '') !== HAL_QUIESCED_CONFIRMATION) throw new Error('cutover_operator_hal_quiesced_confirmation_required');

  const stub = controllerStateStub(env);
  const before = await readSnapshot(stub);
  const readiness = assertExactPromotionCandidate(before);

  const response = await stub.fetch(new Request('https://controller-state.internal/promote', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expected_version: EXACT_V14.version, expected_sha256: EXACT_V14.sha256 })
  }));
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`cutover_operator_promotion_failed:${body.error || response.status}`);

  const after = await readSnapshot(stub);
  if (after.meta.version !== EXACT_V14.version || after.meta.sha256 !== EXACT_V14.sha256 || after.meta.authority !== 'authoritative') {
    throw new Error('cutover_operator_post_promotion_identity_mismatch');
  }

  return {
    ok: true,
    changed: body.changed === true,
    phase: 'authority_promoted_execution_still_safe',
    state_version: after.meta.version,
    state_sha256: after.meta.sha256,
    state_source: after.meta.source,
    authority: after.meta.authority,
    execution_level: policy.execution_level,
    cutover_enabled: policy.cutover_enabled,
    promotion_structurally_eligible: readiness.promotion_structurally_eligible
  };
}

export async function demoteCurrentAuthoritative(env, payload = {}) {
  const policy = assertSafeOperatorPolicy(env);
  if (String(payload.confirmation || '') !== ROLLBACK_CONFIRMATION) throw new Error('rollback_operator_confirmation_required');

  const stub = controllerStateStub(env);
  const before = await readSnapshot(stub);
  if (before.meta.authority === 'shadow') {
    return {
      ok: true,
      changed: false,
      phase: 'already_shadow',
      state_version: before.meta.version,
      state_sha256: before.meta.sha256,
      state_source: before.meta.source,
      authority: before.meta.authority,
      execution_level: policy.execution_level,
      cutover_enabled: policy.cutover_enabled
    };
  }
  if (before.meta.authority !== 'authoritative') throw new Error(`rollback_operator_unexpected_authority:${before.meta.authority}`);

  const response = await stub.fetch(new Request('https://controller-state.internal/demote', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expected_version: before.meta.version, expected_sha256: before.meta.sha256 })
  }));
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`rollback_operator_demotion_failed:${body.error || response.status}`);

  const after = await readSnapshot(stub);
  if (after.meta.version !== before.meta.version || after.meta.sha256 !== before.meta.sha256 || after.meta.authority !== 'shadow') {
    throw new Error('rollback_operator_post_demotion_identity_mismatch');
  }

  return {
    ok: true,
    changed: body.changed === true,
    phase: 'authority_demoted_execution_safe',
    state_version: after.meta.version,
    state_sha256: after.meta.sha256,
    state_source: after.meta.source,
    authority: after.meta.authority,
    execution_level: policy.execution_level,
    cutover_enabled: policy.cutover_enabled
  };
}
