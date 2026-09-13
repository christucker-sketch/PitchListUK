import { readCaControllerCutoverReadinessReport } from './ca-controller-cutover-readiness.mjs';
import { globalCaControllerCutoverEnabled } from './ca-cloud-controller.mjs';

export const CA_AUTHORITY_PROMOTION_MODE = 'operator_promote_ca_shadow_authority';
export const CA_AUTHORITY_PROMOTION_CONFIRMATION = 'PROMOTE_CA_SHADOW_AUTHORITY_WITH_CUTOVER_DISABLED';

function validGitSha(value) {
  return /^[a-f0-9]{40}$/.test(String(value || '').trim().toLowerCase());
}

function validSha256(value) {
  return /^[a-f0-9]{64}$/.test(String(value || '').trim().toLowerCase());
}

function stateStub(env) {
  if (!env?.CA_CONTROLLER_STATE) throw new Error('ca_controller_state_binding_missing');
  return env.CA_CONTROLLER_STATE.get(env.CA_CONTROLLER_STATE.idFromName('ca-controller'));
}

function exactPreconditions(payload = {}) {
  const mainSha = String(payload.expected_main_sha || '').trim().toLowerCase();
  const version = Number(payload.expected_version);
  const sha256 = String(payload.expected_sha256 || '').trim().toLowerCase();
  if (!validGitSha(mainSha)) throw new Error('ca_authority_operator_expected_main_sha_invalid');
  if (!Number.isInteger(version) || version <= 0) throw new Error('ca_authority_operator_expected_version_invalid');
  if (!validSha256(sha256)) throw new Error('ca_authority_operator_expected_sha256_invalid');
  return { mainSha, version, sha256 };
}

function assertPromotionReadiness(readiness, expected) {
  if (globalCaControllerCutoverEnabled({ GLOBAL_CA_CONTROLLER_CUTOVER_ENABLED: readiness?.cutover_enabled ? 'true' : 'false' })) {
    throw new Error('ca_authority_operator_requires_cutover_disabled');
  }
  if (readiness?.cutover_enabled) throw new Error('ca_authority_operator_requires_cutover_disabled');
  if (!readiness?.promotion_ready) {
    throw new Error(`ca_authority_operator_not_ready:${(readiness?.promotion_blockers || []).join(',') || 'unknown'}`);
  }
  if (readiness.authority !== 'shadow') throw new Error(`ca_authority_operator_requires_shadow:${readiness.authority}`);
  if (readiness.current_main_sha !== expected.mainSha) {
    throw new Error(`ca_authority_operator_main_sha_drift:${expected.mainSha}->${readiness.current_main_sha || 'missing'}`);
  }
  if (readiness.state_version !== expected.version || readiness.state_sha256 !== expected.sha256) {
    throw new Error(`ca_authority_operator_state_drift:${expected.version}/${expected.sha256}->${readiness.state_version}/${readiness.state_sha256}`);
  }
}

async function transition(stub, target, expected) {
  const response = await stub.fetch(new Request(`https://ca-controller-state.internal/${target}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expected_version: expected.version, expected_sha256: expected.sha256 })
  }));
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`ca_authority_operator_${target}_failed:${body.error || response.status}`);
  return body;
}

function postPromotionError(readiness, expected) {
  const failures = [];
  if (readiness?.authority !== 'authoritative') failures.push(`authority:${readiness?.authority || 'unknown'}`);
  if (readiness?.cutover_enabled !== false) failures.push(`cutover:${readiness?.cutover_enabled}`);
  if (readiness?.clean_checkpoint !== true) failures.push('checkpoint_not_clean');
  if (readiness?.production_count_matches !== true) failures.push('production_count_mismatch');
  if (readiness?.source_count_matches !== true) failures.push('source_count_mismatch');
  if (readiness?.launch_ready !== true) failures.push(`launch_not_ready:${(readiness?.launch_blockers || []).join(',') || 'unknown'}`);
  if (readiness?.current_main_sha !== expected.mainSha) failures.push(`main_sha:${expected.mainSha}->${readiness?.current_main_sha || 'missing'}`);
  if (readiness?.state_version !== expected.version) failures.push(`state_version:${expected.version}->${readiness?.state_version}`);
  if (readiness?.state_sha256 !== expected.sha256) failures.push(`state_sha256:${expected.sha256}->${readiness?.state_sha256}`);
  return failures;
}

export async function promoteCanadaShadowAuthority(env, payload = {}) {
  if (String(payload.confirmation || '') !== CA_AUTHORITY_PROMOTION_CONFIRMATION) {
    throw new Error('ca_authority_operator_confirmation_required');
  }
  if (globalCaControllerCutoverEnabled(env)) throw new Error('ca_authority_operator_requires_cutover_disabled');

  const expected = exactPreconditions(payload);
  const before = await readCaControllerCutoverReadinessReport(env);
  assertPromotionReadiness(before, expected);

  const stub = stateStub(env);
  const promotion = await transition(stub, 'promote', expected);

  let after;
  let failures;
  try {
    after = await readCaControllerCutoverReadinessReport(env);
    failures = postPromotionError(after, expected);
  } catch (error) {
    failures = [`readiness:${String(error?.message || error)}`];
  }

  if (failures.length) {
    let rollbackError = null;
    try {
      await transition(stub, 'demote', expected);
      const rolledBack = await readCaControllerCutoverReadinessReport(env);
      if (rolledBack.authority !== 'shadow' || rolledBack.cutover_enabled !== false || rolledBack.state_version !== expected.version || rolledBack.state_sha256 !== expected.sha256) {
        rollbackError = 'rollback_postcheck_failed';
      }
    } catch (error) {
      rollbackError = String(error?.message || error);
    }
    throw new Error(`ca_authority_operator_postcheck_failed:${failures.join(',')}${rollbackError ? `;rollback_failed:${rollbackError}` : ';rolled_back_to_shadow'}`);
  }

  return Object.freeze({
    ok: true,
    changed: promotion.changed === true,
    phase: 'ca_authority_promoted_cutover_still_disabled',
    authority: after.authority,
    cutover_enabled: after.cutover_enabled,
    current_main_sha: after.current_main_sha,
    state_version: after.state_version,
    state_sha256: after.state_sha256,
    clean_checkpoint: after.clean_checkpoint,
    production_count_matches: after.production_count_matches,
    source_count_matches: after.source_count_matches,
    launch_ready: after.launch_ready,
    promotion_ready: after.promotion_ready,
    mutation_attempted: false,
    acquisition_started: false
  });
}
