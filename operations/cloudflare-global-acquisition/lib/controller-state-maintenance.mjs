import { shadowControllerDecision } from './controller-shadow-decision.mjs';
import { runCloudControllerTick } from './cloud-controller-tick.mjs';
import {
  pendingDeferredAcquisitionUnits,
  stampControllerCutoverPreflight
} from './controller-cutover-preflight.mjs';
import {
  enrichDeferredAcquisitionReplayUnit,
  proveDeferredAcquisitionUnitSourcesDeployed
} from './controller-replay-source-client.mjs';

const PROMOTE_CONFIRMATION = 'PROMOTE_US_CONTROLLER_TO_AUTHORITATIVE';
const DEMOTE_CONFIRMATION = 'DEMOTE_US_CONTROLLER_TO_SHADOW';
const PREFLIGHT_CONFIRMATION = 'PREPARE_US_CONTROLLER_CUTOVER';

function bearerToken(request) {
  const value = String(request.headers.get('authorization') || '');
  return value.startsWith('Bearer ') ? value.slice(7) : '';
}

async function digest(value) {
  const data = new TextEncoder().encode(String(value));
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data));
}

async function tokenMatches(actual, expected) {
  if (!actual || !expected) return false;
  const [left, right] = await Promise.all([digest(actual), digest(expected)]);
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export function controllerStateStub(env) {
  if (!env?.CONTROLLER_STATE) throw new Error('controller_state_binding_missing');
  const id = env.CONTROLLER_STATE.idFromName('us-controller');
  return env.CONTROLLER_STATE.get(id);
}

async function authorityTransitionRequest(request, stub, pathname) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'invalid_authority_transition_payload' }, { status: 400 });
  }

  const promotion = pathname === '/controller-state/promote';
  const expectedConfirmation = promotion ? PROMOTE_CONFIRMATION : DEMOTE_CONFIRMATION;
  if (String(body?.confirmation || '') !== expectedConfirmation) {
    return Response.json({ ok: false, error: 'authority_transition_confirmation_required' }, { status: 400 });
  }

  return stub.fetch(new Request(`https://controller-state.internal/${promotion ? 'promote' : 'demote'}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      expected_version: body.expected_version,
      expected_sha256: body.expected_sha256
    })
  }));
}

async function controllerReplayPreflightRequest(request, env, stub) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'invalid_cutover_preflight_payload' }, { status: 400 });
  }
  if (String(body?.confirmation || '') !== PREFLIGHT_CONFIRMATION) {
    return Response.json({ ok: false, error: 'cutover_preflight_confirmation_required' }, { status: 400 });
  }
  const expectedVersion = Number(body?.expected_version);
  const expectedSha256 = String(body?.expected_sha256 || '').trim().toLowerCase();
  if (!Number.isInteger(expectedVersion) || expectedVersion <= 0 || !/^[a-f0-9]{64}$/.test(expectedSha256)) {
    return Response.json({ ok: false, error: 'invalid_cutover_preflight_precondition' }, { status: 400 });
  }

  const snapshotResponse = await stub.fetch('https://controller-state.internal/snapshot');
  if (!snapshotResponse.ok) return snapshotResponse;
  const observedVersion = Number(snapshotResponse.headers.get('x-findpitches-state-version') || 0);
  const observedSha256 = String(snapshotResponse.headers.get('x-findpitches-state-sha256') || '').toLowerCase();
  const authority = String(snapshotResponse.headers.get('x-findpitches-state-authority') || 'unknown');
  if (observedVersion !== expectedVersion || observedSha256 !== expectedSha256) {
    return Response.json({
      ok: false,
      error: 'controller_state_precondition_failed',
      current: { version: observedVersion, sha256: observedSha256, authority }
    }, { status: 409 });
  }
  if (authority !== 'shadow') {
    return Response.json({ ok: false, error: 'cutover_preflight_requires_shadow_authority', current_authority: authority }, { status: 409 });
  }

  let state;
  try {
    state = JSON.parse(await snapshotResponse.text());
  } catch {
    return Response.json({ ok: false, error: 'cutover_preflight_snapshot_invalid_json' }, { status: 409 });
  }
  if (state.deferred_replay_inflight) {
    return Response.json({ ok: false, error: 'cutover_preflight_replay_inflight_present' }, { status: 409 });
  }

  const units = pendingDeferredAcquisitionUnits(state);
  let enriched = structuredClone(state);
  const receipts = [];
  try {
    for (const unit of units) {
      const proof = await proveDeferredAcquisitionUnitSourcesDeployed(env, unit);
      const transition = enrichDeferredAcquisitionReplayUnit(enriched, unit, proof, new Date());
      enriched = transition.next_state;
      receipts.push({
        key: transition.key,
        state_code: String(unit.state_code || '').toUpperCase(),
        source_pr_number: transition.source_pr_number,
        deployment_anchor_sha: transition.proof.deployment_anchor_sha,
        registry_blob_sha: transition.proof.registry_blob_sha,
        deployment_check_id: transition.proof.deployment_check_id
      });
    }
    enriched = stampControllerCutoverPreflight(enriched, new Date()).next_state;
  } catch (error) {
    return Response.json({ ok: false, error: String(error?.message || error) }, { status: 409 });
  }

  const raw = `${JSON.stringify(enriched, null, 2)}\n`;
  const writeResponse = await stub.fetch(new Request('https://controller-state.internal/preflight', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'x-findpitches-expected-state-version': String(expectedVersion),
      'x-findpitches-expected-state-sha256': expectedSha256
    },
    body: raw
  }));
  const writeBody = await writeResponse.json().catch(() => ({}));
  if (!writeResponse.ok) return Response.json(writeBody, { status: writeResponse.status });
  return Response.json({
    ok: true,
    preflight_ready: true,
    previous_version: expectedVersion,
    previous_sha256: expectedSha256,
    state_version: Number(writeBody.version),
    state_sha256: String(writeBody.sha256 || ''),
    acquisition_replay_count: units.length,
    proofs: receipts
  }, { status: 201 });
}

async function controllerTickRequest(request, env) {
  let execute = false;
  if (request.method === 'POST') {
    let body;
    try { body = await request.json(); }
    catch { return Response.json({ ok: false, error: 'invalid_controller_tick_payload' }, { status: 400 }); }
    execute = body?.execute === true;
  }
  try {
    return Response.json(await runCloudControllerTick(env, { execute }));
  } catch (error) {
    return Response.json({ ok: false, error: String(error?.message || error) }, { status: 409 });
  }
}

export async function handleControllerStateMaintenance(request, env) {
  const configuredToken = String(env?.CONTROLLER_STATE_IMPORT_TOKEN || '');
  if (!configuredToken) {
    return Response.json({ ok: false, error: 'controller_state_maintenance_disabled' }, { status: 404 });
  }
  if (!(await tokenMatches(bearerToken(request), configuredToken))) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const stub = controllerStateStub(env);

  if (request.method === 'GET' && url.pathname === '/controller-state/meta') {
    return stub.fetch('https://controller-state.internal/meta');
  }

  if (request.method === 'GET' && url.pathname === '/controller-state/snapshot') {
    return stub.fetch('https://controller-state.internal/snapshot');
  }

  if (request.method === 'GET' && url.pathname === '/controller-state/decision') {
    const response = await stub.fetch('https://controller-state.internal/snapshot');
    if (!response.ok) return response;
    const text = await response.text();
    const state = JSON.parse(text);
    return Response.json({
      ok: true,
      authority: response.headers.get('x-findpitches-state-authority') || 'unknown',
      state_sha256: response.headers.get('x-findpitches-state-sha256'),
      state_version: Number(response.headers.get('x-findpitches-state-version') || 0),
      decision: shadowControllerDecision(state)
    });
  }

  if ((request.method === 'GET' || request.method === 'POST') && url.pathname === '/controller-state/tick') {
    return controllerTickRequest(request, env);
  }

  if (request.method === 'PUT' && url.pathname === '/controller-state/snapshot') {
    const headers = new Headers(request.headers);
    headers.set('x-findpitches-state-source', 'hal-us-growth');
    headers.set('x-findpitches-state-authority', 'shadow');
    return stub.fetch(new Request('https://controller-state.internal/snapshot', {
      method: 'PUT',
      headers,
      body: request.body,
      duplex: 'half'
    }));
  }

  if (request.method === 'POST' && url.pathname === '/controller-state/replay-preflight') {
    return controllerReplayPreflightRequest(request, env, stub);
  }

  if (request.method === 'POST' && (url.pathname === '/controller-state/promote' || url.pathname === '/controller-state/demote')) {
    return authorityTransitionRequest(request, stub, url.pathname);
  }

  return new Response('Not found', { status: 404 });
}

export { PROMOTE_CONFIRMATION, DEMOTE_CONFIRMATION, PREFLIGHT_CONFIRMATION };
