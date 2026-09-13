import { buildControllerCutoverReadinessReport } from './controller-cutover-readiness.mjs';
import {
  assertControllerCutoverPreflightReady,
  pendingDeferredAcquisitionUnits,
  stampControllerCutoverPreflight
} from './controller-cutover-preflight.mjs';
import { globalControllerCutoverEnabled } from './controller-authority-guard.mjs';
import { globalControllerExecutionLevel } from './dispatch.mjs';
import { sha256Hex, validateControllerStateText } from './controller-state-codec.mjs';

export const FINAL_HAL_HANDOVER_PATH = '/controller-state/exact-final-hal-handover';
export const FINAL_HAL_HANDOVER_CONFIRMATION = 'IMPORT_FINAL_STOPPED_HAL_SNAPSHOT';
export const FINAL_HAL_SNAPSHOT_SHA256 = '185b08c033f8024da2302bea5748985ad6176cdda8495a1c5c7886074d21ef60';

export const FINAL_HAL_HANDOVER_BASE = Object.freeze({
  version: 14,
  sha256: '23848852c67dd091513d8c26af75e8e7bd55a21d13cfe05739396cd46f2b4dec',
  source: 'cloudflare-us-controller-preflight',
  authority: 'shadow'
});

function stateStub(env) {
  if (!env?.CONTROLLER_STATE) throw new Error('controller_state_binding_missing');
  return env.CONTROLLER_STATE.get(env.CONTROLLER_STATE.idFromName('us-controller'));
}

function snapshotMeta(response) {
  return {
    version: Number(response.headers.get('x-findpitches-state-version') || 0),
    sha256: String(response.headers.get('x-findpitches-state-sha256') || '').toLowerCase(),
    source: String(response.headers.get('x-findpitches-state-source') || 'unknown'),
    authority: String(response.headers.get('x-findpitches-state-authority') || 'unknown')
  };
}

function markerReady(state) {
  const marker = state?.cloud_controller_hal_handover;
  return Boolean(
    marker?.status === 'ready' &&
    marker?.final_hal_snapshot_sha256 === FINAL_HAL_SNAPSHOT_SHA256 &&
    marker?.hal_quiesced_confirmation === 'HAL_US_GROWTH_STOPPED_AND_DISABLED'
  );
}

function assertSafePolicy(env) {
  const execution = globalControllerExecutionLevel(env);
  const cutover = globalControllerCutoverEnabled(env);
  if (execution !== 'read_only') throw new Error(`final_hal_handover_requires_read_only:${execution}`);
  if (cutover) throw new Error('final_hal_handover_requires_cutover_disabled');
}

function assertFrozenHalState(state) {
  if (state.status !== 'ready') throw new Error(`final_hal_handover_status_not_ready:${String(state.status)}`);
  if (state.current) throw new Error('final_hal_handover_current_work_present');
  if (state.active_instance) throw new Error('final_hal_handover_active_instance_present');
  if (state.deferred_replay_inflight) throw new Error('final_hal_handover_replay_inflight_present');
  const acquisitions = pendingDeferredAcquisitionUnits(state);
  if (acquisitions.length !== 0) throw new Error(`final_hal_handover_unexpected_acquisition_replays:${acquisitions.length}`);
}

async function readSnapshot(stub) {
  const response = await stub.fetch('https://controller-state.internal/snapshot');
  if (!response.ok) throw new Error(`final_hal_handover_snapshot_http_${response.status}`);
  const text = await response.text();
  let state;
  try { state = JSON.parse(text); }
  catch { throw new Error('final_hal_handover_snapshot_invalid_json'); }
  return { state, meta: snapshotMeta(response) };
}

function isExpectedBase(meta) {
  return meta.version === FINAL_HAL_HANDOVER_BASE.version &&
    meta.sha256 === FINAL_HAL_HANDOVER_BASE.sha256 &&
    meta.source === FINAL_HAL_HANDOVER_BASE.source &&
    meta.authority === FINAL_HAL_HANDOVER_BASE.authority;
}

export function finalHalHandoverMarkerReady(state) {
  return markerReady(state);
}

export async function handleExactFinalHalHandover(request, env) {
  if (request.method !== 'PUT') return new Response('Method not allowed', { status: 405 });
  assertSafePolicy(env);

  if (String(request.headers.get('x-findpitches-handover-confirmation') || '') !== FINAL_HAL_HANDOVER_CONFIRMATION) {
    return Response.json({ ok: false, error: 'final_hal_handover_confirmation_required' }, { status: 400 });
  }

  const raw = await request.text();
  const checksum = await sha256Hex(raw);
  if (checksum !== FINAL_HAL_SNAPSHOT_SHA256) {
    return Response.json({ ok: false, error: 'final_hal_handover_snapshot_sha_mismatch', observed_sha256: checksum }, { status: 409 });
  }

  let frozenState;
  try {
    frozenState = validateControllerStateText(raw);
    assertFrozenHalState(frozenState);
  } catch (error) {
    return Response.json({ ok: false, error: String(error?.message || error) }, { status: 409 });
  }

  const stub = stateStub(env);
  const before = await readSnapshot(stub);

  if (before.meta.authority === 'shadow' && before.meta.source === 'cloudflare-us-controller-preflight' && markerReady(before.state)) {
    const readiness = buildControllerCutoverReadinessReport(before.state, before.meta);
    return Response.json({
      ok: true,
      changed: false,
      reason: 'already_final_hal_handover_ready',
      final_hal_snapshot_sha256: FINAL_HAL_SNAPSHOT_SHA256,
      state_version: before.meta.version,
      state_sha256: before.meta.sha256,
      authority: before.meta.authority,
      state_source: before.meta.source,
      promotion_structurally_eligible: readiness.promotion_structurally_eligible,
      promotion_blockers: readiness.promotion_blockers
    });
  }

  let importedMeta;
  if (before.meta.authority === 'shadow' && before.meta.source === 'hal-us-growth' && before.meta.sha256 === FINAL_HAL_SNAPSHOT_SHA256) {
    importedMeta = before.meta;
  } else {
    if (!isExpectedBase(before.meta)) {
      return Response.json({
        ok: false,
        error: 'final_hal_handover_base_identity_mismatch',
        current: before.meta
      }, { status: 409 });
    }

    const imported = await stub.fetch(new Request('https://controller-state.internal/snapshot', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'x-findpitches-state-source': 'hal-us-growth',
        'x-findpitches-state-authority': 'shadow'
      },
      body: raw
    }));
    const body = await imported.json().catch(() => ({}));
    if (!imported.ok) return Response.json(body, { status: imported.status });
    importedMeta = {
      version: Number(body.version),
      sha256: String(body.sha256 || '').toLowerCase(),
      source: String(body.source || 'hal-us-growth'),
      authority: String(body.authority || 'shadow')
    };
    if (importedMeta.sha256 !== FINAL_HAL_SNAPSHOT_SHA256 || importedMeta.authority !== 'shadow') {
      return Response.json({ ok: false, error: 'final_hal_handover_import_identity_mismatch', current: importedMeta }, { status: 409 });
    }
  }

  const now = new Date();
  let preflightState = structuredClone(frozenState);
  preflightState.cloud_controller_hal_handover = {
    status: 'ready',
    final_hal_snapshot_sha256: FINAL_HAL_SNAPSHOT_SHA256,
    hal_quiesced_confirmation: 'HAL_US_GROWTH_STOPPED_AND_DISABLED',
    imported_state_version: importedMeta.version,
    imported_state_sha256: importedMeta.sha256,
    completed_at: now.toISOString()
  };
  preflightState = stampControllerCutoverPreflight(preflightState, now).next_state;
  const preflightRaw = `${JSON.stringify(preflightState, null, 2)}\n`;

  const preflight = await stub.fetch(new Request('https://controller-state.internal/preflight', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'x-findpitches-expected-state-version': String(importedMeta.version),
      'x-findpitches-expected-state-sha256': importedMeta.sha256
    },
    body: preflightRaw
  }));
  const preflightBody = await preflight.json().catch(() => ({}));
  if (!preflight.ok) return Response.json(preflightBody, { status: preflight.status });

  const after = await readSnapshot(stub);
  try { assertControllerCutoverPreflightReady(after.state); }
  catch (error) { return Response.json({ ok: false, error: String(error?.message || error) }, { status: 409 }); }
  if (!markerReady(after.state)) return Response.json({ ok: false, error: 'final_hal_handover_marker_missing_after_preflight' }, { status: 409 });

  const readiness = buildControllerCutoverReadinessReport(after.state, after.meta);
  return Response.json({
    ok: true,
    changed: true,
    reason: 'final_hal_snapshot_imported_and_preflighted',
    final_hal_snapshot_sha256: FINAL_HAL_SNAPSHOT_SHA256,
    imported_state_version: importedMeta.version,
    imported_state_sha256: importedMeta.sha256,
    state_version: after.meta.version,
    state_sha256: after.meta.sha256,
    authority: after.meta.authority,
    state_source: after.meta.source,
    promotion_structurally_eligible: readiness.promotion_structurally_eligible,
    promotion_blockers: readiness.promotion_blockers
  }, { status: 201 });
}
