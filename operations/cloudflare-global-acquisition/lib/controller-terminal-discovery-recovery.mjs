const RECOVERY_PATH = '/controller-state/recover-terminal-discovery';
const RECOVERY_CONFIRMATION = 'RECOVER_TERMINAL_DISCOVERY_NO_OUTPUT';
const INCIDENT_WORKFLOW_ID = 'usctl-v16-ca-q64-l4';
const INCIDENT_STATE_VERSION = 18;
const INCIDENT_STATE_SHA256 = '16af6a514f5acfb54956f164bd7ec98be299948abe8d3941c94511a669f7a6a5';

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
  if (!env?.CONTROLLER_STATE) throw new Error('controller_state_binding_missing');
  const id = env.CONTROLLER_STATE.idFromName('us-controller');
  return env.CONTROLLER_STATE.get(id);
}

async function readSnapshot(stub) {
  const response = await stub.fetch('https://controller-state.internal/snapshot');
  if (!response.ok) throw new Error(`controller_state_read_http_${response.status}`);
  const text = await response.text();
  return {
    state: JSON.parse(text),
    version: Number(response.headers.get('x-findpitches-state-version') || 0),
    sha256: String(response.headers.get('x-findpitches-state-sha256') || '').toLowerCase(),
    authority: String(response.headers.get('x-findpitches-state-authority') || 'unknown')
  };
}

async function checkpoint(stub, snapshot, nextState) {
  const raw = `${JSON.stringify(nextState, null, 2)}\n`;
  const response = await stub.fetch(new Request('https://controller-state.internal/checkpoint', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'x-findpitches-expected-state-version': String(snapshot.version),
      'x-findpitches-expected-state-sha256': snapshot.sha256
    },
    body: raw
  }));
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `controller_state_checkpoint_http_${response.status}`);
  return body;
}

export async function handleTerminalDiscoveryRecovery(request, env) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const configuredToken = String(env?.CONTROLLER_STATE_IMPORT_TOKEN || '');
  if (!configuredToken) return Response.json({ ok: false, error: 'controller_state_maintenance_disabled' }, { status: 404 });
  if (!(await tokenMatches(bearerToken(request), configuredToken))) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ ok: false, error: 'invalid_recovery_payload' }, { status: 400 }); }
  if (String(body?.confirmation || '') !== RECOVERY_CONFIRMATION) {
    return Response.json({ ok: false, error: 'recovery_confirmation_required' }, { status: 400 });
  }

  const stub = stateStub(env);
  const snapshot = await readSnapshot(stub);
  const priorRecovery = snapshot.state?.cloud_controller_terminal_discovery_recovery;
  if (
    priorRecovery?.workflow_id === INCIDENT_WORKFLOW_ID &&
    snapshot.state?.status === 'ready' &&
    !snapshot.state?.active_instance &&
    !snapshot.state?.current
  ) {
    return Response.json({
      ok: true,
      changed: false,
      reason: 'incident_already_recovered',
      state_version: snapshot.version,
      state_sha256: snapshot.sha256,
      authority: snapshot.authority,
      workflow_id: INCIDENT_WORKFLOW_ID
    });
  }

  if (snapshot.version !== INCIDENT_STATE_VERSION || snapshot.sha256 !== INCIDENT_STATE_SHA256) {
    return Response.json({
      ok: false,
      error: 'incident_state_precondition_failed',
      current: { version: snapshot.version, sha256: snapshot.sha256, authority: snapshot.authority }
    }, { status: 409 });
  }
  if (snapshot.authority !== 'authoritative') {
    return Response.json({ ok: false, error: 'incident_recovery_requires_authoritative_state' }, { status: 409 });
  }

  const state = snapshot.state;
  const active = state?.active_instance;
  const current = state?.current;
  if (
    state?.status !== 'running_cloudflare_discovery' ||
    active?.id !== INCIDENT_WORKFLOW_ID || active?.mode !== 'discover' || active?.state_code !== 'CA' ||
    current?.mode !== 'discover' || current?.state_code !== 'CA' || Number(current?.query_offset) !== 64 || Number(current?.query_limit) !== 4
  ) {
    return Response.json({ ok: false, error: 'incident_checkpoint_mismatch' }, { status: 409 });
  }
  if (Array.isArray(state?.results) && state.results.some(item => item?.instance_id === INCIDENT_WORKFLOW_ID)) {
    return Response.json({ ok: false, error: 'incident_workflow_result_already_checkpointed' }, { status: 409 });
  }

  const instance = await env.GLOBAL_ACQUISITION.get(INCIDENT_WORKFLOW_ID);
  if (!instance || typeof instance.status !== 'function') {
    return Response.json({ ok: false, error: 'incident_workflow_lookup_failed' }, { status: 409 });
  }
  const details = await instance.status();
  const workflowStatus = String(details?.status || 'unknown');
  const workflowOutput = details?.output;
  const errorMessage = String(details?.error?.message || '');
  if (!['errored', 'terminated'].includes(workflowStatus)) {
    return Response.json({ ok: false, error: 'incident_workflow_not_terminal', workflow_status: workflowStatus }, { status: 409 });
  }
  if (workflowOutput !== null && workflowOutput !== undefined && workflowOutput !== '') {
    return Response.json({ ok: false, error: 'incident_workflow_output_present' }, { status: 409 });
  }
  if (!/(Unexpected end of JSON input|Missing required secret\/config: GITHUB_TOKEN)/.test(errorMessage)) {
    return Response.json({ ok: false, error: 'incident_workflow_error_mismatch', workflow_error: errorMessage }, { status: 409 });
  }

  const nextState = structuredClone(state);
  nextState.active_instance = null;
  nextState.current = null;
  nextState.status = 'ready';
  nextState.cloud_controller_terminal_discovery_recovery = {
    workflow_id: INCIDENT_WORKFLOW_ID,
    workflow_status: workflowStatus,
    workflow_error: errorMessage,
    preserved_state_code: 'CA',
    preserved_query_offset: 64,
    preserved_query_limit: 4,
    recovered_at: new Date().toISOString()
  };
  nextState.updated_at = new Date().toISOString();

  const written = await checkpoint(stub, snapshot, nextState);
  return Response.json({
    ok: true,
    changed: true,
    reason: 'terminal_discovery_no_output_recovered',
    previous_state_version: snapshot.version,
    previous_state_sha256: snapshot.sha256,
    state_version: Number(written.version),
    state_sha256: String(written.sha256 || ''),
    authority: snapshot.authority,
    workflow_id: INCIDENT_WORKFLOW_ID,
    workflow_status: workflowStatus,
    preserved_state_code: 'CA',
    preserved_query_offset: 64,
    preserved_query_limit: 4
  }, { status: 201 });
}

export { RECOVERY_PATH, RECOVERY_CONFIRMATION };
