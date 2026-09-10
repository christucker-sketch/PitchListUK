import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEMOTE_CONFIRMATION,
  PROMOTE_CONFIRMATION,
  handleControllerStateMaintenance
} from '../operations/cloudflare-global-acquisition/lib/controller-state-maintenance.mjs';

function envWithStub(handler) {
  return {
    CONTROLLER_STATE_IMPORT_TOKEN: 'secret',
    CONTROLLER_STATE: {
      idFromName: value => value,
      get: () => ({ fetch: handler })
    }
  };
}

function maintenanceRequest(path, body) {
  return new Request(`https://example.test${path}`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer secret',
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });
}

test('promotion requires the exact explicit confirmation phrase before touching controller state', async () => {
  let called = false;
  const env = envWithStub(async () => {
    called = true;
    return Response.json({ ok: true });
  });
  const response = await handleControllerStateMaintenance(
    maintenanceRequest('/controller-state/promote', {
      confirmation: 'yes',
      expected_version: 10,
      expected_sha256: 'a'.repeat(64)
    }),
    env
  );
  assert.equal(response.status, 400);
  assert.equal(called, false);
  assert.equal((await response.json()).error, 'authority_transition_confirmation_required');
});

test('promotion forwards only exact snapshot preconditions to the durable object', async () => {
  let observed;
  const env = envWithStub(async request => {
    observed = {
      url: String(request.url || request),
      method: request.method,
      body: await request.json()
    };
    return Response.json({
      ok: true,
      changed: true,
      state: { version: 10, sha256: 'a'.repeat(64), authority: 'authoritative' }
    });
  });

  const response = await handleControllerStateMaintenance(
    maintenanceRequest('/controller-state/promote', {
      confirmation: PROMOTE_CONFIRMATION,
      expected_version: 10,
      expected_sha256: 'a'.repeat(64),
      ignored: 'must-not-forward'
    }),
    env
  );
  assert.equal(response.status, 200);
  assert.deepEqual(observed, {
    url: 'https://controller-state.internal/promote',
    method: 'POST',
    body: { expected_version: 10, expected_sha256: 'a'.repeat(64) }
  });
  const body = await response.json();
  assert.equal(body.state.authority, 'authoritative');
});

test('demotion uses a separate confirmation phrase and rollback endpoint', async () => {
  let observedUrl;
  const env = envWithStub(async request => {
    observedUrl = String(request.url || request);
    return Response.json({
      ok: true,
      changed: true,
      state: { version: 10, sha256: 'b'.repeat(64), authority: 'shadow' }
    });
  });

  const response = await handleControllerStateMaintenance(
    maintenanceRequest('/controller-state/demote', {
      confirmation: DEMOTE_CONFIRMATION,
      expected_version: 10,
      expected_sha256: 'b'.repeat(64)
    }),
    env
  );
  assert.equal(response.status, 200);
  assert.equal(observedUrl, 'https://controller-state.internal/demote');
  assert.equal((await response.json()).state.authority, 'shadow');
});

test('decision endpoint reports the durable object authority rather than assuming shadow', async () => {
  const snapshot = {
    status: 'ready',
    snapshot_count: 704,
    target_count: 1200,
    priority_order: ['MA'],
    priority_cursor: 0,
    query_offsets: { MA: 72 },
    active_instance: null,
    current: null,
    pending_source_ids: [],
    acquisition_batch: 1,
    deferred_units: []
  };
  const env = envWithStub(async request => {
    if (String(request).endsWith('/snapshot')) {
      return new Response(JSON.stringify(snapshot), {
        status: 200,
        headers: {
          'x-findpitches-state-sha256': 'c'.repeat(64),
          'x-findpitches-state-version': '10',
          'x-findpitches-state-authority': 'authoritative'
        }
      });
    }
    return Response.json({ ok: true });
  });
  const request = new Request('https://example.test/controller-state/decision', {
    headers: { authorization: 'Bearer secret' }
  });
  const response = await handleControllerStateMaintenance(request, env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.authority, 'authoritative');
  assert.equal(body.state_version, 10);
  assert.equal(body.state_sha256, 'c'.repeat(64));
});
