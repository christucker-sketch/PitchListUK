import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CUTOVER_CONFIRMATION,
  demoteCurrentAuthoritative,
  EXACT_V14,
  HAL_QUIESCED_CONFIRMATION,
  promoteExactV14,
  ROLLBACK_CONFIRMATION
} from '../operations/cloudflare-global-acquisition/lib/controller-cutover-operator.mjs';

function state() {
  return {
    status: 'ready',
    current: null,
    active_instance: null,
    deferred_replay_inflight: null,
    deferred_units: [],
    cloud_controller_cutover_preflight: {
      status: 'ready',
      acquisition_replay_count: 0,
      acquisition_replay_keys: [],
      proven_source_prs: [],
      completed_at: '2026-09-10T18:56:34.603Z'
    },
    updated_at: '2026-09-10T18:56:34.603Z'
  };
}

function snapshotResponse({ authority = 'shadow', version = EXACT_V14.version, sha256 = EXACT_V14.sha256, source = EXACT_V14.source } = {}) {
  return new Response(`${JSON.stringify(state())}\n`, {
    headers: {
      'x-findpitches-state-version': String(version),
      'x-findpitches-state-sha256': sha256,
      'x-findpitches-state-authority': authority,
      'x-findpitches-state-source': source
    }
  });
}

function env(options = {}) {
  let current = {
    authority: options.authority || 'shadow',
    version: options.version || EXACT_V14.version,
    sha256: options.sha256 || EXACT_V14.sha256,
    source: options.source || EXACT_V14.source
  };
  const calls = [];
  const stub = {
    async fetch(request) {
      const url = new URL(typeof request === 'string' ? request : request.url);
      calls.push({ pathname: url.pathname, method: typeof request === 'string' ? 'GET' : request.method });
      if (url.pathname === '/snapshot') return snapshotResponse(current);
      if (url.pathname === '/promote') {
        current = { ...current, authority: 'authoritative' };
        return Response.json({ ok: true, changed: true });
      }
      if (url.pathname === '/demote') {
        current = { ...current, authority: 'shadow' };
        return Response.json({ ok: true, changed: true });
      }
      return new Response('not found', { status: 404 });
    }
  };
  return {
    calls,
    value: {
      GLOBAL_ACQUISITION_EXECUTION_ENABLED: 'true',
      GLOBAL_ACQUISITION_EXECUTION_LEVEL: options.executionLevel || 'read_only',
      GLOBAL_CONTROLLER_CUTOVER_ENABLED: options.cutoverEnabled ? 'true' : 'false',
      CONTROLLER_STATE: {
        idFromName(name) { return name; },
        get() { return stub; }
      }
    }
  };
}

const cutoverPayload = {
  confirmation: CUTOVER_CONFIRMATION,
  hal_quiesced_confirmation: HAL_QUIESCED_CONFIRMATION
};

test('promotes only the exact preflight-ready v14 snapshot while execution remains safe', async () => {
  const fixture = env();
  const result = await promoteExactV14(fixture.value, cutoverPayload);
  assert.equal(result.ok, true);
  assert.equal(result.authority, 'authoritative');
  assert.equal(result.state_version, EXACT_V14.version);
  assert.equal(result.state_sha256, EXACT_V14.sha256);
  assert.equal(result.execution_level, 'read_only');
  assert.equal(result.cutover_enabled, false);
  assert.deepEqual(fixture.calls.map(call => call.pathname), ['/snapshot', '/promote', '/snapshot']);
});

test('refuses promotion without explicit Hal quiesced confirmation', async () => {
  const fixture = env();
  await assert.rejects(
    promoteExactV14(fixture.value, { confirmation: CUTOVER_CONFIRMATION }),
    /cutover_operator_hal_quiesced_confirmation_required/
  );
  assert.equal(fixture.calls.length, 0);
});

test('refuses promotion on exact-state identity drift', async () => {
  const fixture = env({ version: 15 });
  await assert.rejects(promoteExactV14(fixture.value, cutoverPayload), /cutover_operator_version_drift:15/);
  assert.equal(fixture.calls.some(call => call.pathname === '/promote'), false);
});

test('refuses promotion unless Worker policy is read-only and cutover disabled', async () => {
  const production = env({ executionLevel: 'production' });
  await assert.rejects(promoteExactV14(production.value, cutoverPayload), /requires_read_only_execution/);
  const cutover = env({ cutoverEnabled: true });
  await assert.rejects(promoteExactV14(cutover.value, cutoverPayload), /requires_cutover_disabled/);
});

test('rollback demotes the exact currently observed authoritative snapshot after safe policy restore', async () => {
  const fixture = env({ authority: 'authoritative', version: 19, sha256: 'a'.repeat(64), source: 'cloudflare-us-controller' });
  const result = await demoteCurrentAuthoritative(fixture.value, { confirmation: ROLLBACK_CONFIRMATION });
  assert.equal(result.ok, true);
  assert.equal(result.authority, 'shadow');
  assert.equal(result.state_version, 19);
  assert.equal(result.state_sha256, 'a'.repeat(64));
  assert.deepEqual(fixture.calls.map(call => call.pathname), ['/snapshot', '/demote', '/snapshot']);
});

test('rollback is idempotent when state is already shadow', async () => {
  const fixture = env();
  const result = await demoteCurrentAuthoritative(fixture.value, { confirmation: ROLLBACK_CONFIRMATION });
  assert.equal(result.changed, false);
  assert.equal(result.phase, 'already_shadow');
  assert.deepEqual(fixture.calls.map(call => call.pathname), ['/snapshot']);
});
