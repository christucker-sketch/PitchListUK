import { shadowControllerDecision } from './controller-shadow-decision.mjs';
import { assertAuthoritativeUsMutationAllowed } from './controller-authority-guard.mjs';

function stateStub(env) {
  const id = env.CONTROLLER_STATE.idFromName('us-controller');
  return env.CONTROLLER_STATE.get(id);
}

async function readSnapshot(stub) {
  const response = await stub.fetch('https://controller-state.internal/snapshot');
  if (!response.ok) throw new Error(`controller_state_read_http_${response.status}`);
  const text = await response.text();
  return {
    state: JSON.parse(text),
    text,
    version: Number(response.headers.get('x-findpitches-state-version') || 0),
    sha256: String(response.headers.get('x-findpitches-state-sha256') || ''),
    authority: String(response.headers.get('x-findpitches-state-authority') || 'unknown')
  };
}

export async function checkpointCloudControllerState(stub, snapshot, nextState) {
  const raw = `${JSON.stringify(nextState, null, 2)}\n`;
  const response = await stub.fetch(new Request('https://controller-state.internal/checkpoint', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'x-findpitches-expected-state-version': String(snapshot.version),
      'x-findpitches-expected-state-sha256': String(snapshot.sha256)
    },
    body: raw
  }));
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${body?.error || `controller_state_checkpoint_http_${response.status}`}`);
  }
  return body;
}

export async function runCloudControllerTick(env, options = {}) {
  const execute = options.execute === true;
  const stub = stateStub(env);
  const snapshot = await readSnapshot(stub);
  const decision = shadowControllerDecision(snapshot.state);

  if (!execute) {
    return {
      ok: true,
      executed: false,
      authority: snapshot.authority,
      state_version: snapshot.version,
      state_sha256: snapshot.sha256,
      decision
    };
  }

  await assertAuthoritativeUsMutationAllowed(env, {
    country: 'US',
    mode: decision.mode || 'controller',
    handler: 'us_production_workflow'
  });

  if (snapshot.authority !== 'authoritative') {
    throw new Error(`controller_state_not_authoritative:${snapshot.authority}`);
  }

  // HAL-006B intentionally fails closed until each mutating decision handler is
  // implemented and proven independently. checkpointCloudControllerState() is
  // the only supported persisted-write path and requires exact version/SHA CAS.
  throw new Error(`cloud_controller_action_not_implemented:${decision.action}`);
}
