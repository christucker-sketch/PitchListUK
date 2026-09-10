import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PREFLIGHT_CONFIRMATION,
  handleControllerStateMaintenance
} from '../operations/cloudflare-global-acquisition/lib/controller-state-maintenance.mjs';

function deferredAcquire(stateCode, batch, sourceIds) {
  return {
    disposition: 'deferred_for_replay', mode: 'acquire', state_code: stateCode,
    batch_number: batch, source_ids: sourceIds, replay_attempts: 0
  };
}

function proofFor(stateCode, sourceIds, sourcePr = 1656) {
  return {
    state_code: stateCode,
    source_ids: sourceIds,
    source_pr_number: sourcePr,
    source_head_sha: '1'.repeat(40),
    main_sha: '2'.repeat(40),
    registry_blob_sha: '3'.repeat(40),
    deployment_anchor_sha: '4'.repeat(40),
    deployment_registry_blob_sha: '3'.repeat(40),
    deployment_anchor_is_main_ancestor: true,
    check_runs: [
      { id: 10, name: 'verify', status: 'completed', conclusion: 'success' },
      { id: 11, name: 'deploy_acquisition_worker_production', status: 'completed', conclusion: 'success' }
    ]
  };
}

function request(body) {
  return new Request('https://example.test/controller-state/replay-preflight', {
    method: 'POST',
    headers: { authorization: 'Bearer secret', 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

function environment(initialState, brokerHandler) {
  const writes = [];
  let brokerCalls = 0;
  const stub = {
    async fetch(input) {
      const normalized = input instanceof Request ? input : new Request(input);
      if (normalized.method === 'GET' && normalized.url.endsWith('/snapshot')) {
        return new Response(JSON.stringify(initialState), {
          status: 200,
          headers: {
            'x-findpitches-state-version': '10',
            'x-findpitches-state-sha256': 'a'.repeat(64),
            'x-findpitches-state-authority': 'shadow'
          }
        });
      }
      if (normalized.method === 'PUT' && normalized.url.endsWith('/preflight')) {
        writes.push({
          expectedVersion: normalized.headers.get('x-findpitches-expected-state-version'),
          expectedSha256: normalized.headers.get('x-findpitches-expected-state-sha256'),
          state: JSON.parse(await normalized.text())
        });
        return Response.json({ ok: true, changed: true, version: 11, sha256: 'b'.repeat(64), authority: 'shadow' }, { status: 201 });
      }
      return new Response('not found', { status: 404 });
    }
  };
  return {
    env: {
      CONTROLLER_STATE_IMPORT_TOKEN: 'secret',
      CONTROLLER_STATE: { idFromName: () => 'id', get: () => stub },
      GITHUB_PR_BROKER: {
        async fetch(input) {
          brokerCalls += 1;
          return brokerHandler(input, brokerCalls);
        }
      }
    },
    writes,
    brokerCalls: () => brokerCalls
  };
}

test('preflight re-proves every queued acquisition replay then performs one exact shadow CAS write', async () => {
  const state = {
    status: 'ready', deferred_replay_inflight: null,
    deferred_units: [
      deferredAcquire('TX', 2, ['src_b', 'src_a']),
      deferredAcquire('NY', 1, ['src_c'])
    ]
  };
  const harness = environment(state, async input => {
    const payload = JSON.parse(await input.text());
    const sourcePr = payload.state_code === 'TX' ? 1656 : 1657;
    return Response.json({ ok: true, provenance: proofFor(payload.state_code, payload.source_ids, sourcePr) });
  });
  const response = await handleControllerStateMaintenance(request({
    confirmation: PREFLIGHT_CONFIRMATION,
    expected_version: 10,
    expected_sha256: 'a'.repeat(64)
  }), harness.env);
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.preflight_ready, true);
  assert.equal(body.acquisition_replay_count, 2);
  assert.equal(body.proofs.length, 2);
  assert.equal(harness.brokerCalls(), 2);
  assert.equal(harness.writes.length, 1);
  assert.equal(harness.writes[0].expectedVersion, '10');
  assert.equal(harness.writes[0].expectedSha256, 'a'.repeat(64));
  assert.equal(harness.writes[0].state.cloud_controller_cutover_preflight.status, 'ready');
  assert.equal(harness.writes[0].state.deferred_units.every(unit => Number.isInteger(unit.source_pr)), true);
});

test('one failed provenance proof aborts the whole preflight with no partial state write', async () => {
  const state = {
    status: 'ready', deferred_replay_inflight: null,
    deferred_units: [
      deferredAcquire('TX', 2, ['src_a']),
      deferredAcquire('NY', 1, ['src_b'])
    ]
  };
  const harness = environment(state, async (input, call) => {
    const payload = JSON.parse(await input.text());
    if (call === 2) return Response.json({ ok: false, error: 'provenance_not_found' }, { status: 409 });
    return Response.json({ ok: true, provenance: proofFor(payload.state_code, payload.source_ids) });
  });
  const response = await handleControllerStateMaintenance(request({
    confirmation: PREFLIGHT_CONFIRMATION,
    expected_version: 10,
    expected_sha256: 'a'.repeat(64)
  }), harness.env);
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /provenance_not_found/);
  assert.equal(harness.brokerCalls(), 2);
  assert.equal(harness.writes.length, 0);
  assert.equal(state.deferred_units[0].source_pr, undefined);
});

test('stale snapshot precondition and inflight replay stop before provenance or writes', async () => {
  const base = { status: 'ready', deferred_replay_inflight: null, deferred_units: [deferredAcquire('TX', 2, ['src_a'])] };
  const stale = environment(base, async () => { throw new Error('broker_should_not_run'); });
  const staleResponse = await handleControllerStateMaintenance(request({
    confirmation: PREFLIGHT_CONFIRMATION,
    expected_version: 9,
    expected_sha256: 'a'.repeat(64)
  }), stale.env);
  assert.equal(staleResponse.status, 409);
  assert.equal(stale.brokerCalls(), 0);
  assert.equal(stale.writes.length, 0);

  const inflight = environment({ ...base, deferred_replay_inflight: deferredAcquire('TX', 2, ['src_a']) }, async () => { throw new Error('broker_should_not_run'); });
  const inflightResponse = await handleControllerStateMaintenance(request({
    confirmation: PREFLIGHT_CONFIRMATION,
    expected_version: 10,
    expected_sha256: 'a'.repeat(64)
  }), inflight.env);
  assert.equal(inflightResponse.status, 409);
  assert.equal((await inflightResponse.json()).error, 'cutover_preflight_replay_inflight_present');
  assert.equal(inflight.brokerCalls(), 0);
  assert.equal(inflight.writes.length, 0);
});

test('preflight requires its explicit confirmation phrase', async () => {
  const harness = environment({ status: 'ready', deferred_units: [], deferred_replay_inflight: null }, async () => {
    throw new Error('broker_should_not_run');
  });
  const response = await handleControllerStateMaintenance(request({
    confirmation: 'yes', expected_version: 10, expected_sha256: 'a'.repeat(64)
  }), harness.env);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'cutover_preflight_confirmation_required');
  assert.equal(harness.brokerCalls(), 0);
  assert.equal(harness.writes.length, 0);
});
