import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkpointCloudControllerState,
  runCloudControllerTick
} from '../operations/cloudflare-global-acquisition/lib/cloud-controller-tick.mjs';

function makeEnv(state) {
  const stub = { async fetch() { return new Response(JSON.stringify(state), { status: 200, headers: {
    'x-findpitches-state-version': '12',
    'x-findpitches-state-sha256': 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'x-findpitches-state-authority': 'authoritative'
  }}); } };
  return {
    CONTROLLER_STATE: { idFromName: v => v, get: () => stub },
    GLOBAL_CONTROLLER_CUTOVER_ENABLED: 'false',
    GLOBAL_CONTROLLER_EXECUTION_LEVEL: 'read_only',
    GLOBAL_CONTROLLER_EXECUTION_ENABLED: 'true'
  };
}

const state = {
  status: 'ready', snapshot_count: 704, target_count: 1200,
  priority_order: ['MA'], priority_cursor: 0, query_offsets: { MA: 72 },
  active_instance: null, current: null, pending_source_ids: [], acquisition_batch: 1, deferred_units: []
};

test('tick reads the exact stored controller snapshot and returns its decision', async () => {
  const result = await runCloudControllerTick(makeEnv(state));
  assert.equal(result.ok, true);
  assert.equal(result.executed, false);
  assert.equal(result.authority, 'authoritative');
  assert.equal(result.state_version, 12);
  assert.equal(result.decision.action, 'trigger_discovery');
  assert.equal(result.decision.state_code, 'MA');
  assert.equal(result.decision.query_offset, 72);
});

test('tick stays gated while cutover is disabled', async () => {
  await assert.rejects(() => runCloudControllerTick(makeEnv(state), { execute: true }));
});

test('checkpoint helper uses exact version and SHA compare-and-swap preconditions', async () => {
  let observed;
  const stub = {
    async fetch(request) {
      observed = {
        url: String(request.url || request),
        method: request.method,
        version: request.headers.get('x-findpitches-expected-state-version'),
        sha256: request.headers.get('x-findpitches-expected-state-sha256'),
        state: JSON.parse(await request.text())
      };
      return Response.json({ ok: true, changed: true, version: 13, sha256: 'b'.repeat(64) }, { status: 201 });
    }
  };
  const snapshot = { version: 12, sha256: 'a'.repeat(64) };
  const nextState = { ...state, status: 'running_cloudflare_discovery' };
  const result = await checkpointCloudControllerState(stub, snapshot, nextState);
  assert.equal(result.version, 13);
  assert.deepEqual(observed, {
    url: 'https://controller-state.internal/checkpoint',
    method: 'PUT',
    version: '12',
    sha256: 'a'.repeat(64),
    state: nextState
  });
});

test('checkpoint helper fails closed when Durable Object rejects stale state', async () => {
  const stub = {
    async fetch() {
      return Response.json({ ok: false, error: 'controller_state_precondition_failed' }, { status: 409 });
    }
  };
  await assert.rejects(
    () => checkpointCloudControllerState(stub, { version: 12, sha256: 'a'.repeat(64) }, state),
    /controller_state_precondition_failed/
  );
});
