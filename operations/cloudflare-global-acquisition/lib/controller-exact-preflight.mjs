import { globalControllerCutoverEnabled } from './controller-authority-guard.mjs';
import {
  pendingDeferredAcquisitionUnits,
  stampControllerCutoverPreflight
} from './controller-cutover-preflight.mjs';
import { readControllerCutoverReadinessReport } from './controller-cutover-readiness.mjs';
import { globalControllerExecutionLevel } from './dispatch.mjs';

export const EXACT_V13_PREFLIGHT_MODE = 'prepare_exact_v13_cutover_preflight';

export const EXACT_V13_PREFLIGHT_TARGET = Object.freeze({
  state_version: 13,
  state_sha256: 'c63721df101ea7977e5d2d618f99883541a39df7ce88dcb9ec0700af46c3538e',
  state_source: 'cloudflare-us-controller-legacy-recovery',
  state_status: 'ready'
});

function stateStub(env) {
  if (!env?.CONTROLLER_STATE) throw new Error('controller_state_binding_missing');
  return env.CONTROLLER_STATE.get(env.CONTROLLER_STATE.idFromName('us-controller'));
}

function snapshotMeta(response) {
  return {
    authority: String(response.headers.get('x-findpitches-state-authority') || 'unknown'),
    version: Number(response.headers.get('x-findpitches-state-version') || 0),
    sha256: String(response.headers.get('x-findpitches-state-sha256') || '').toLowerCase(),
    source: String(response.headers.get('x-findpitches-state-source') || 'unknown')
  };
}

export function assertExactV13PreflightTarget(state, meta) {
  if (meta.authority !== 'shadow') throw new Error(`exact_v13_preflight_requires_shadow:${meta.authority}`);
  if (meta.version !== EXACT_V13_PREFLIGHT_TARGET.state_version) throw new Error(`exact_v13_preflight_version_mismatch:${meta.version}`);
  if (meta.sha256 !== EXACT_V13_PREFLIGHT_TARGET.state_sha256) throw new Error(`exact_v13_preflight_sha_mismatch:${meta.sha256}`);
  if (meta.source !== EXACT_V13_PREFLIGHT_TARGET.state_source) throw new Error(`exact_v13_preflight_source_mismatch:${meta.source}`);
  if (state?.status !== EXACT_V13_PREFLIGHT_TARGET.state_status) throw new Error(`exact_v13_preflight_status_mismatch:${String(state?.status)}`);
  if (state?.active_instance) throw new Error('exact_v13_preflight_active_instance_present');
  if (state?.deferred_replay_inflight) throw new Error('exact_v13_preflight_replay_inflight_present');
  if (state?.current) throw new Error('exact_v13_preflight_current_work_present');
  const acquisitionUnits = pendingDeferredAcquisitionUnits(state);
  if (acquisitionUnits.length !== 0) throw new Error(`exact_v13_preflight_unexpected_acquisition_replays:${acquisitionUnits.length}`);
  return true;
}

export async function prepareExactV13CutoverPreflight(env = {}, now = new Date()) {
  if (globalControllerCutoverEnabled(env)) throw new Error('exact_v13_preflight_requires_cutover_disabled');
  if (globalControllerExecutionLevel(env) !== 'read_only') throw new Error('exact_v13_preflight_requires_read_only_execution');

  const stub = stateStub(env);
  const snapshotResponse = await stub.fetch('https://controller-state.internal/snapshot');
  if (!snapshotResponse.ok) throw new Error(`exact_v13_preflight_snapshot_http_${snapshotResponse.status}`);
  const meta = snapshotMeta(snapshotResponse);
  let state;
  try {
    state = JSON.parse(await snapshotResponse.text());
  } catch {
    throw new Error('exact_v13_preflight_snapshot_invalid_json');
  }

  if (meta.authority === 'shadow' && meta.source === 'cloudflare-us-controller-preflight') {
    const report = await readControllerCutoverReadinessReport(env);
    if (!report.preflight_marker_ready || !report.promotion_structurally_eligible) {
      throw new Error('exact_v13_preflight_existing_marker_not_ready');
    }
    return Object.freeze({
      ok: true,
      preflight_ready: true,
      changed: false,
      reason: 'already_preflight_ready',
      state_version: report.state_version,
      state_sha256: report.state_sha256,
      authority: report.authority,
      state_source: report.state_source,
      promotion_structurally_eligible: report.promotion_structurally_eligible
    });
  }

  assertExactV13PreflightTarget(state, meta);
  const stamped = stampControllerCutoverPreflight(state, now).next_state;
  const raw = `${JSON.stringify(stamped, null, 2)}\n`;
  const writeResponse = await stub.fetch(new Request('https://controller-state.internal/preflight', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'x-findpitches-expected-state-version': String(meta.version),
      'x-findpitches-expected-state-sha256': meta.sha256
    },
    body: raw
  }));
  const writeBody = await writeResponse.json().catch(() => null);
  if (!writeResponse.ok || writeBody?.ok !== true) {
    throw new Error(`exact_v13_preflight_write_failed:${writeResponse.status}:${String(writeBody?.error || 'unknown')}`);
  }

  const report = await readControllerCutoverReadinessReport(env);
  if (report.authority !== 'shadow') throw new Error('exact_v13_preflight_postcondition_authority');
  if (report.state_source !== 'cloudflare-us-controller-preflight') throw new Error('exact_v13_preflight_postcondition_source');
  if (!report.preflight_marker_ready) throw new Error('exact_v13_preflight_postcondition_marker');
  if (!report.promotion_structurally_eligible) throw new Error(`exact_v13_preflight_postcondition_blocked:${report.promotion_blockers.join(',')}`);

  return Object.freeze({
    ok: true,
    preflight_ready: true,
    changed: true,
    reason: 'exact_v13_preflight_stamped',
    previous_version: meta.version,
    previous_sha256: meta.sha256,
    state_version: report.state_version,
    state_sha256: report.state_sha256,
    authority: report.authority,
    state_source: report.state_source,
    promotion_structurally_eligible: report.promotion_structurally_eligible
  });
}
