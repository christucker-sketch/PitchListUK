import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertStaleAuthorityRecoveryTarget,
  recoverStaleHalAuthorityV12,
  STALE_AUTHORITY_RECOVERY_TARGET
} from '../operations/cloudflare-global-acquisition/lib/controller-authority-recovery.mjs';

function liveState() {
  return {
    status: 'running_cloudflare_discovery',
    updated_at: STALE_AUTHORITY_RECOVERY_TARGET.state_updated_at,
    current: { state_code: 'MI', mode: 'discover' },
    active_instance: { id: STALE_AUTHORITY_RECOVERY_TARGET.active_instance_id },
    deferred_replay_inflight: {
      key: 'discover:MI:128:4',
      mode: 'discover',
      state_code: 'MI'
    },
    deferred_units: []
  };
}

function envHarness(initialAuthority = 'authoritative') {
  const calls = [];
  let authority = initialAuthority;
  const state = liveState();
  const headers = () => ({
    'content-type': 'application/json; charset=utf-8',
    'x-findpitches-state-authority': authority,
    'x-findpitches-state-version': String(STALE_AUTHORITY_RECOVERY_TARGET.state_version),
    'x-findpitches-state-sha256': STALE_AUTHORITY_RECOVERY_TARGET.state_sha256,
    'x-findpitches-state-source': STALE_AUTHORITY_RECOVERY_TARGET.state_source,
    'x-findpitches-state-imported-at': STALE_AUTHORITY_RECOVERY_TARGET.state_imported_at
  });
  const stub = {
    async fetch(input) {
      const request = input instanceof Request ? input : new Request(input);
      calls.push({ url: request.url, method: request.method });
      if (request.url.endsWith('/snapshot')) {
        return new Response(JSON.stringify(state), { status: 200, headers: headers() });
      }
      if (request.url.endsWith('/demote')) {
        const body = JSON.parse(await request.text());
        assert.equal(body.expected_version, STALE_AUTHORITY_RECOVERY_TARGET.state_version);
        assert.equal(body.expected_sha256, STALE_AUTHORITY_RECOVERY_TARGET.state_sha256);
        assert.equal(authority, 'authoritative');
        authority = 'shadow';
        return Response.json({ ok: true, changed: true, state: { authority } });
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
        idFromName(name) {
          assert.equal(name, 'us-controller');
          return 'us-controller-id';
        },
        get(id) {
          assert.equal(id, 'us-controller-id');
          return stub;
        }
      }
    },
    calls,
    authority: () => authority,
    state
  };
}

test('exact stale Hal authority snapshot demotes one metadata bit and re-proves identity', async () => {
  const harness = envHarness('authoritative');
  const result = await recoverStaleHalAuthorityV12(harness.env);
  assert.equal(result.ok, true);
  assert.equal(result.recovered, true);
  assert.equal(result.changed, true);
  assert.equal(result.authority, 'shadow');
  assert.equal(result.state_version, 12);
  assert.equal(result.state_sha256, STALE_AUTHORITY_RECOVERY_TARGET.state_sha256);
  assert.equal(harness.authority(), 'shadow');
  assert.deepEqual(harness.calls.map(call => [call.method, call.url.split('/').at(-1)]), [
    ['GET', 'snapshot'],
    ['POST', 'demote'],
    ['GET', 'snapshot']
  ]);
});

test('exact snapshot already shadow is idempotent and performs no demotion write', async () => {
  const harness = envHarness('shadow');
  const result = await recoverStaleHalAuthorityV12(harness.env);
  assert.equal(result.recovered, true);
  assert.equal(result.changed, false);
  assert.equal(result.reason, 'already_shadow');
  assert.deepEqual(harness.calls.map(call => call.method), ['GET']);
});

test('identity drift fails closed before demotion', async () => {
  const harness = envHarness('authoritative');
  harness.state.current.state_code = 'OH';
  await assert.rejects(
    () => recoverStaleHalAuthorityV12(harness.env),
    /stale_authority_recovery_identity_mismatch:current_state_code/
  );
  assert.deepEqual(harness.calls.map(call => call.method), ['GET']);
  assert.equal(harness.authority(), 'authoritative');
});

test('recovery requires cutover disabled and read-only execution', async () => {
  const enabled = envHarness('authoritative');
  enabled.env.GLOBAL_CONTROLLER_CUTOVER_ENABLED = 'true';
  await assert.rejects(() => recoverStaleHalAuthorityV12(enabled.env), /requires_cutover_disabled/);
  assert.deepEqual(enabled.calls, []);

  const production = envHarness('authoritative');
  production.env.GLOBAL_ACQUISITION_EXECUTION_LEVEL = 'production';
  await assert.rejects(() => recoverStaleHalAuthorityV12(production.env), /requires_read_only_execution/);
  assert.deepEqual(production.calls, []);
});

test('target assertion rejects any non-target authority or snapshot identity', () => {
  const base = {
    ...STALE_AUTHORITY_RECOVERY_TARGET,
    authority: 'authoritative',
    deferred_replay_inflight: true,
    deferred_acquisition_replay_count: 0
  };
  assert.equal(assertStaleAuthorityRecoveryTarget(base), base);
  assert.throws(() => assertStaleAuthorityRecoveryTarget({ ...base, authority: 'unknown' }), /authority_invalid/);
  assert.throws(() => assertStaleAuthorityRecoveryTarget({ ...base, state_version: 13 }), /identity_mismatch:state_version/);
});
