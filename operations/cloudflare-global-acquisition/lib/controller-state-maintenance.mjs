import { shadowControllerDecision } from './controller-shadow-decision.mjs';

const PROMOTE_CONFIRMATION = 'PROMOTE_US_CONTROLLER_TO_AUTHORITATIVE';
const DEMOTE_CONFIRMATION = 'DEMOTE_US_CONTROLLER_TO_SHADOW';

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

  if (request.method === 'POST' && (url.pathname === '/controller-state/promote' || url.pathname === '/controller-state/demote')) {
    return authorityTransitionRequest(request, stub, url.pathname);
  }

  return new Response('Not found', { status: 404 });
}

export { PROMOTE_CONFIRMATION, DEMOTE_CONFIRMATION };
