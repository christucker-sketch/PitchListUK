import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertExactV13PreflightTarget,
  EXACT_V13_PREFLIGHT_TARGET,
  prepareExactV13CutoverPreflight
} from '../operations/cloudflare-global-acquisition/lib/controller-exact-preflight.mjs';

function v13State() {
  return {
    status: 'ready',
    updated_at: '2026-09-10T18:50:28.633Z',
    current: null,
    active_instance: null,
    deferred_replay_inflight: null,
    deferred_units: [{
      disposition: 'deferred_for_replay',
      mode: 'discover',
      state_code: 'MI',
      query_offset: 128,
      query_limit: 4,
      replay_attempts: 1
    }]
  };
}

function envHarness() {
  let version = 13;
  let sha = EXACT_V13_PREFLIGHT_TARGET.state_sha256;
  let source = EXACT_V13_PREFLIGHT_TARGET.state_source;
  let state = v13State();
  const calls = [];
  const stub = {
    async fetch(input) {
      const request = input instanceof Request ? input : new Request(input);
      calls.push({ method: request.method, url: request.url });
      if (request.url.endsWith('/snapshot')) {
        return new Response(JSON.stringify(state), {
          status: 200,
          headers: {
            'x-findpitches-state-authority': 'shadow',
            'x-findpitches-state-version': String(version),
            'x-findpitches-state-sha256': sha,
            'x-findpitches-state-source': source,
            'x-findpitches-state-imported-at': '2026-09-10T18:50:28.633Z'
          }
        });
      }
      if (request.url.endsWith('/preflight')) {
        assert.equal(request.method, 'PUT');
        assert.equal(request.headers.get('x-findpitches-expected-state-version'), '13');
        assert.equal(request.headers.get('x-findpitches-expected-state-sha256'), EXACT_V13_PREFLIGHT_TARGET.state_sha256);
        state = JSON.parse(await request.text());
        version = 14;
        sha = 'e'.repeat(64);
        source = 'cloudflare-us-controller-preflight';
        return Response.json({ ok: true, changed: true, version, sha256: sha, source, authority: 'shadow' }, { status: 201 });
      }
      return new Response('not found', { status: 404 });
    }
  };
  return {
    env: {
      GLOBAL_CONTROLLER_CUTOVER_ENABLED: 'false',
      GLOBAL_ACQUISITION_EXECUTION_ENABLED: 'true',
      GLOBAL_ACQUISITION_EXECUTION_LEVEL: 'read_only',
      CONTROLLER_STATE: {
        idFromName(name) { assert.equal(name, 'us-controller'); return 'id'; },
        get(id) { assert.equal(id, 'id'); return stub; }
      }
    },
    calls,
    state: () => state,
    meta: () => ({ version, sha, source })
  };
}

test('exact v13 preflight permits queued discovery replay but no active or acquisition replay work', () => {
  assert.equal(assertExactV13PreflightTarget(v13State(), {
    authority: 'shadow',
    version: 13,
    sha256: EXACT_V13_PREFLIGHT_TARGET.state_sha256,
    source: EXACT_V13_PREFLIGHT_TARGET.state_source
  }), true);
});

test('exact v13 preflight fails closed on snapshot or active-work drift', () => {
  const state = v13State();
  assert.throws(() => assertExactV13PreflightTarget(state, {
    authority: 'shadow', version: 14, sha256: EXACT_V13_PREFLIGHT_TARGET.state_sha256, source: EXACT_V13_PREFLIGHT_TARGET.state_source
  }), /version_mismatch/);
  state.active_instance = { id: 'cf_other' };
  assert.throws(() => assertExactV13PreflightTarget(state, {
    authority: 'shadow', version: 13, sha256: EXACT_V13_PREFLIGHT_TARGET.state_sha256, source: EXACT_V13_PREFLIGHT_TARGET.state_source
  }), /active_instance_present/);
});

test('exact v13 preflight stamps marker through CAS preflight endpoint and remains shadow', async () => {
  const harness = envHarness();
  const result = await prepareExactV13CutoverPreflight(harness.env, new Date('2026-09-10T19:00:00.000Z'));
  assert.equal(result.ok, true);
  assert.equal(result.preflight_ready, true);
  assert.equal(result.changed, true);
  assert.equal(result.previous_version, 13);
  assert.equal(result.state_version, 14);
  assert.equal(result.authority, 'shadow');
  assert.equal(result.state_source, 'cloudflare-us-controller-preflight');
  assert.equal(result.promotion_structurally_eligible, true);
  assert.equal(harness.state().cloud_controller_cutover_preflight.status, 'ready');
  assert.deepEqual(harness.calls.map(call => call.method), ['GET', 'PUT', 'GET']);
});

test('exact v13 preflight requires cutover disabled and read-only execution', async () => {
  const cutover = envHarness();
  cutover.env.GLOBAL_CONTROLLER_CUTOVER_ENABLED = 'true';
  await assert.rejects(() => prepareExactV13CutoverPreflight(cutover.env), /requires_cutover_disabled/);
  assert.deepEqual(cutover.calls, []);

  const prod = envHarness();
  prod.env.GLOBAL_ACQUISITION_EXECUTION_LEVEL = 'production';
  await assert.rejects(() => prepareExactV13CutoverPreflight(prod.env), /requires_read_only_execution/);
  assert.deepEqual(prod.calls, []);
});
