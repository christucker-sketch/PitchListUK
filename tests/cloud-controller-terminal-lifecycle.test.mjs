import test from 'node:test';
import assert from 'node:assert/strict';
import { runCloudControllerTick } from '../operations/cloudflare-global-acquisition/lib/cloud-controller-tick.mjs';

function baseState(overrides = {}) {
  return {
    status: 'ready', snapshot_count: 706, live_api_count: 706, target_count: 1200,
    priority_order: ['MA'], priority_cursor: 0, query_offsets: { MA: 9999 },
    current: null, active_instance: null, pending_source_ids: [], acquisition_batch: 1,
    deferred_units: [], deferred_replay_inflight: null, cloud_controller_intent: null,
    state_totals: { MA: 10 }, results: [], deployments: [], completed_milestones: [],
    ...overrides
  };
}

function makeEnv(initial) {
  let state = structuredClone(initial);
  let version = 60;
  let sha = '1'.repeat(64);
  let checkpoints = 0;
  const stub = {
    async fetch(request) {
      const url = new URL(typeof request === 'string' ? request : request.url);
      if (url.pathname === '/snapshot') return new Response(JSON.stringify(state), { status: 200, headers: {
        'x-findpitches-state-version': String(version),
        'x-findpitches-state-sha256': sha,
        'x-findpitches-state-authority': 'authoritative'
      }});
      if (url.pathname === '/meta') return Response.json({ ok: true, state: { version, sha256: sha, authority: 'authoritative' } });
      if (url.pathname === '/checkpoint') {
        state = JSON.parse(await request.text());
        checkpoints += 1;
        version += 1;
        sha = String(version).padStart(64, '0');
        return Response.json({ ok: true, changed: true, version, sha256: sha }, { status: 201 });
      }
      return new Response('not found', { status: 404 });
    }
  };
  return {
    CONTROLLER_STATE: { idFromName: value => value, get: () => stub },
    GLOBAL_ACQUISITION_EXECUTION_ENABLED: 'true',
    GLOBAL_ACQUISITION_EXECUTION_LEVEL: 'production',
    GLOBAL_CONTROLLER_CUTOVER_ENABLED: 'true',
    getState: () => state,
    getCheckpoints: () => checkpoints
  };
}

test('clean exhausted discovery plan checkpoints sweep_complete then complete', async () => {
  const env = makeEnv(baseState());
  const swept = await runCloudControllerTick(env, { execute: true });
  assert.equal(swept.phase, 'controller_sweep_complete');
  assert.equal(env.getState().status, 'sweep_complete');
  assert.equal(env.getCheckpoints(), 1);

  const completed = await runCloudControllerTick(env, { execute: true });
  assert.equal(completed.phase, 'controller_complete');
  assert.equal(env.getState().status, 'complete');
  assert.equal(env.getState().completion_reason, 'sweep_exhausted');
  assert.equal(env.getCheckpoints(), 2);

  const stable = await runCloudControllerTick(env, { execute: true });
  assert.equal(stable.executed, false);
  assert.equal(stable.phase, 'controller_already_complete');
  assert.equal(env.getCheckpoints(), 2);
});

test('target reached completes explicitly and retires remaining acquisition context', async () => {
  const env = makeEnv(baseState({
    status: 'ready_acquisition', snapshot_count: 1200, live_api_count: 1200, target_count: 1200,
    current: { state_code: 'MA', source_pr: 1700 },
    pending_source_ids: ['src_a'], acquisition_batch: 2
  }));
  const result = await runCloudControllerTick(env, { execute: true });
  assert.equal(result.phase, 'controller_complete');
  assert.equal(env.getState().status, 'complete');
  assert.equal(env.getState().completion_reason, 'target_reached');
  assert.equal(env.getState().current, null);
  assert.deepEqual(env.getState().pending_source_ids, []);
  assert.equal(env.getState().acquisition_batch, 1);
});

test('already-blocked deferred controller is idempotent and preserves exact evidence', async () => {
  const env = makeEnv(baseState({
    status: 'blocked_deferred',
    blocked: { reason: 'deferred_blocker', blocker_count: 1, deferred_count: 0, blocked_at: '2026-09-10T17:00:00.000Z' },
    deferred_units: [{ disposition: 'genuine_blocker', state_code: 'MA', mode: 'discover' }]
  }));
  const result = await runCloudControllerTick(env, { execute: true });
  assert.equal(result.executed, false);
  assert.equal(result.phase, 'controller_already_blocked');
  assert.equal(env.getState().status, 'blocked_deferred');
  assert.equal(env.getState().blocked.reason, 'deferred_blocker');
  assert.equal(env.getState().blocked.blocker_count, 1);
  assert.equal(env.getCheckpoints(), 0);
});

test('unsupported controller status remains a hard error and never mutates state', async () => {
  const env = makeEnv(baseState({ status: 'mystery_status' }));
  await assert.rejects(() => runCloudControllerTick(env, { execute: true }), /cloud_controller_unsupported_status:mystery_status/);
  assert.equal(env.getCheckpoints(), 0);
  assert.equal(env.getState().status, 'mystery_status');
});
