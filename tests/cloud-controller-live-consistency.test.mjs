import test from 'node:test';
import assert from 'node:assert/strict';
import { runCloudControllerTick } from '../operations/cloudflare-global-acquisition/lib/cloud-controller-tick.mjs';

const mergeSha = 'c'.repeat(40);

function initialState() {
  return {
    status: 'waiting_for_live_consistency', snapshot_count: 706, live_api_count: 704, target_count: 1200,
    priority_order: ['TX'], priority_cursor: 0, query_offsets: { TX: 12 },
    current: {
      mode: 'acquire', state_code: 'TX', data_pr: 1701,
      pending_deploy: {
        sha: mergeSha, count: 706, previous_count: 704, additions: 2,
        opportunity_ids: ['opp_a', 'opp_b'], pr_number: 1701
      },
      live_consistency: {
        deployment_id: 'github-check:101', deployment_check_id: 101,
        production_sha: mergeSha,
        started_at: '2026-09-10T16:20:00.000Z', deadline_at: '2099-09-10T16:22:00.000Z',
        attempts: 0, last_checked_at: null, last_live_count: null, last_error: null
      }
    },
    active_instance: null, pending_source_ids: ['src_a'], acquisition_batch: 1,
    state_totals: { TX: 42 }, deferred_units: [], results: [], deployments: [], completed_milestones: []
  };
}

function makeEnv() {
  let state = initialState();
  let version = 50;
  let sha = '1'.repeat(64);
  let checkpoints = 0;
  const stateStub = {
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
    CONTROLLER_STATE: { idFromName: value => value, get: () => stateStub },
    GLOBAL_ACQUISITION_EXECUTION_ENABLED: 'true',
    GLOBAL_ACQUISITION_EXECUTION_LEVEL: 'production',
    GLOBAL_CONTROLLER_CUTOVER_ENABLED: 'true',
    getState: () => state,
    getCheckpoints: () => checkpoints
  };
}

function liveFetch(total, stateIds, stateTotal = stateIds.length) {
  return async url => {
    const value = String(url);
    if (value.includes('state=TX')) {
      return Response.json({ total: stateTotal, rows: stateIds.map(id => ({ id })) });
    }
    return Response.json({ total, rows: [] });
  };
}

test('live consistency tick records clean propagation lag and stays waiting', async () => {
  const env = makeEnv();
  const result = await runCloudControllerTick(env, { execute: true, liveFetch: liveFetch(704, ['legacy_a']) });
  assert.equal(result.phase, 'live_consistency_waiting');
  assert.equal(result.executed, true);
  assert.equal(result.live_count, 704);
  assert.equal(env.getCheckpoints(), 1);
  assert.equal(env.getState().status, 'waiting_for_live_consistency');
  assert.equal(env.getState().current.live_consistency.attempts, 1);
  assert.equal(env.getState().current.live_consistency.last_live_count, 704);
  assert.equal(env.getState().acquisition_batch, 1);
});

test('live consistency tick finalizes exact count plus exact new identities and advances one batch', async () => {
  const env = makeEnv();
  const result = await runCloudControllerTick(env, { execute: true, liveFetch: liveFetch(706, ['legacy_a', 'opp_a', 'opp_b']) });
  assert.equal(result.phase, 'live_consistency_verified');
  assert.equal(result.executed, true);
  assert.equal(result.live_count, 706);
  assert.equal(env.getCheckpoints(), 1);
  assert.equal(env.getState().status, 'ready_acquisition');
  assert.equal(env.getState().live_api_count, 706);
  assert.equal(env.getState().acquisition_batch, 2);
  assert.equal(env.getState().current.pending_deploy, undefined);
  assert.equal(env.getState().current.live_consistency, undefined);
  assert.equal(env.getState().deployments.length, 1);
  assert.equal(env.getState().deployments[0].production_sha, mergeSha);
  assert.equal(env.getState().deployments[0].deployment_id, 'github-check:101');
});

test('live consistency tick fails closed on mixed partial publication without checkpointing', async () => {
  const env = makeEnv();
  await assert.rejects(
    () => runCloudControllerTick(env, { execute: true, liveFetch: liveFetch(705, ['legacy_a', 'opp_a']) }),
    /live_consistency_unexpected_partial_count/
  );
  assert.equal(env.getCheckpoints(), 0);
  assert.equal(env.getState().status, 'waiting_for_live_consistency');
});

test('live consistency tick derives deployment identity from the latest checkpoint snapshot', async () => {
  const env = makeEnv();
  env.getState().current.live_consistency.deployment_id = 'github-check:999';
  env.getState().current.live_consistency.deployment_check_id = 999;
  const result = await runCloudControllerTick(env, { execute: true, liveFetch: liveFetch(706, ['legacy_a', 'opp_a', 'opp_b']) });
  assert.equal(result.phase, 'live_consistency_verified');
  assert.equal(env.getCheckpoints(), 1);
  assert.equal(env.getState().deployments[0].deployment_id, 'github-check:999');
  assert.equal(env.getState().deployments[0].deployment_check_id, 999);
});

test('transient live API failure is checkpointed inside the deadline instead of losing retry history', async () => {
  const env = makeEnv();
  const result = await runCloudControllerTick(env, {
    execute: true,
    liveFetch: async () => new Response('temporary', { status: 503 })
  });
  assert.equal(result.phase, 'live_consistency_transient_failure');
  assert.equal(result.executed, true);
  assert.equal(env.getCheckpoints(), 1);
  assert.equal(env.getState().current.live_consistency.attempts, 1);
  assert.match(env.getState().current.live_consistency.last_error, /live_api_http_503/);
});
