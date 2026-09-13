import { runUkCloudControllerTick, ukControllerDecision } from './uk-cloud-controller.mjs';

const PROMOTE_UK_CONFIRMATION = 'PROMOTE_UK_CONTROLLER_TO_AUTHORITATIVE';
const DEMOTE_UK_CONFIRMATION = 'DEMOTE_UK_CONTROLLER_TO_SHADOW';

function bearerToken(request) {
  const value = String(request.headers.get('authorization') || '');
  return value.startsWith('Bearer ') ? value.slice(7) : '';
}

async function digest(value) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value))));
}

async function tokenMatches(actual, expected) {
  if (!actual || !expected) return false;
  const [left, right] = await Promise.all([digest(actual), digest(expected)]);
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

function stateStub(env) {
  if (!env?.UK_CONTROLLER_STATE) throw new Error('uk_controller_state_binding_missing');
  return env.UK_CONTROLLER_STATE.get(env.UK_CONTROLLER_STATE.idFromName('uk-controller'));
}

function tickEnv(env) {
  return { ...env, CONTROLLER_STATE: env.UK_CONTROLLER_STATE };
}

async function transition(request, env, target) {
  let body;
  try { body = await request.json(); } catch { return Response.json({ ok: false, error: 'uk_controller_authority_payload_invalid' }, { status: 400 }); }
  const expected = target === 'authoritative' ? PROMOTE_UK_CONFIRMATION : DEMOTE_UK_CONFIRMATION;
  if (String(body?.confirmation || '') !== expected) return Response.json({ ok: false, error: 'uk_controller_authority_confirmation_required' }, { status: 400 });
  return stateStub(env).fetch(new Request(`https://uk-controller-state.internal/${target === 'authoritative' ? 'promote' : 'demote'}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expected_version: body.expected_version, expected_sha256: body.expected_sha256 })
  }));
}

export async function handleUkControllerStateMaintenance(request, env) {
  const configuredToken = String(env?.CONTROLLER_STATE_IMPORT_TOKEN || '');
  if (!configuredToken) return Response.json({ ok: false, error: 'uk_controller_state_maintenance_disabled' }, { status: 404 });
  if (!(await tokenMatches(bearerToken(request), configuredToken))) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const url = new URL(request.url);
  const stub = stateStub(env);

  if (request.method === 'GET' && url.pathname === '/uk-controller-state/meta') return stub.fetch('https://uk-controller-state.internal/meta');
  if (request.method === 'GET' && url.pathname === '/uk-controller-state/snapshot') return stub.fetch('https://uk-controller-state.internal/snapshot');

  if (request.method === 'GET' && url.pathname === '/uk-controller-state/decision') {
    const response = await stub.fetch('https://uk-controller-state.internal/snapshot');
    if (!response.ok) return response;
    const state = JSON.parse(await response.text());
    return Response.json({
      ok: true,
      authority: response.headers.get('x-findpitches-state-authority') || 'unknown',
      state_version: Number(response.headers.get('x-findpitches-state-version') || 0),
      state_sha256: response.headers.get('x-findpitches-state-sha256') || '',
      status: state.status,
      production_count: state.production_count,
      source_count: state.source_count,
      decision: ukControllerDecision(state)
    });
  }

  if ((request.method === 'GET' || request.method === 'POST') && url.pathname === '/uk-controller-state/tick') {
    let execute = false;
    if (request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return Response.json({ ok: false, error: 'invalid_uk_controller_tick_payload' }, { status: 400 }); }
      execute = body?.execute === true;
    }
    try { return Response.json(await runUkCloudControllerTick(tickEnv(env), { execute })); }
    catch (error) { return Response.json({ ok: false, error: String(error?.message || error) }, { status: 409 }); }
  }

  if (request.method === 'POST' && url.pathname === '/uk-controller-state/promote') return transition(request, env, 'authoritative');
  if (request.method === 'POST' && url.pathname === '/uk-controller-state/demote') return transition(request, env, 'shadow');
  return new Response('Not found', { status: 404 });
}

export { PROMOTE_UK_CONFIRMATION, DEMOTE_UK_CONFIRMATION };
