import test from 'node:test';
import assert from 'node:assert/strict';
import { runCloudControllerTick } from '../operations/cloudflare-global-acquisition/lib/cloud-controller-tick.mjs';

const mergeSha = 'c'.repeat(40);

function initialState() {
  return {
    status: 'deploying_production', snapshot_count: 706, target_count: 1200,
    priority_order: ['TX'], priority_cursor: 0, query_offsets: { TX: 12 },
    current: {
      mode: 'acquire', state_code: 'TX', data_pr: 1701,
      pending_deploy: {
        sha: mergeSha, count: 706, previous_count: 704, additions: 2,
        opportunity_ids: ['opp_b', 'opp_a'], pr_number: 1701
      }
    },
    active_instance: null, pending_source_ids: ['src_a'], acquisition_batch: 1,
    state_totals: { TX: 42 }, deferred_units: [], results: [], deployments: []
  };
}

function makeEnv(checkRuns) {
  let state = initialState();
  let version = 40;
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
  const broker = {
    async fetch(request) {
      const payload = JSON.parse(await request.text());
      assert.deepEqual(payload, { action: 'inspect_data_merge_checks', pr_number: 1701 });
      return Response.json({ ok: true, deployment: {
        pr_number: 1701, merge_sha: mergeSha, merged_at: '2026-09-10T16:20:00Z', check_runs: checkRuns
      }});
    }
  };
  return {
    CONTROLLER_STATE: { idFromName: value => value, get: () => stateStub },
    GITHUB_PR_BROKER: broker,
    GLOBAL_ACQUISITION_EXECUTION_ENABLED: 'true',
    GLOBAL_ACQUISITION_EXECUTION_LEVEL: 'production',
    GLOBAL_CONTROLLER_CUTOVER_ENABLED: 'true',
    GLOBAL_CONTROLLER_LIVE_CONSISTENCY_TIMEOUT_SECONDS: '120',
    getState: () => state,
    getCheckpoints: () => checkpoints
  };
}

const verify = { id: 100, name: 'verify', status: 'completed', conclusion: 'success' };
const deploy = { id: 101, name: 'deploy_frontend_production', status: 'completed', conclusion: 'success' };

test('deploying production tick waits without state mutation while exact frontend deploy check is pending', async () => {
  const env = makeEnv([verify, { ...deploy, status: 'in_progress', conclusion: null }]);
  const result = await runCloudControllerTick(env, { execute: true });
  assert.equal(result.executed, false);
  assert.equal(result.phase, 'waiting_for_frontend_production_deploy');
  assert.equal(result.waiting_for, 'deploy_frontend_production');
  assert.equal(env.getCheckpoints(), 0);
  assert.equal(env.getState().status, 'deploying_production');
});

test('deploying production tick checkpoints live-consistency only after exact verified frontend deployment succeeds', async () => {
  const env = makeEnv([verify, deploy]);
  const result = await runCloudControllerTick(env, { execute: true });
  assert.equal(result.executed, true);
  assert.equal(result.phase, 'frontend_production_deploy_verified');
  assert.equal(result.merge_sha, mergeSha);
  assert.equal(result.deployment_check_id, 101);
  assert.equal(env.getCheckpoints(), 1);
  assert.equal(env.getState().status, 'waiting_for_live_consistency');
  assert.equal(env.getState().current.live_consistency.production_sha, mergeSha);
  assert.equal(env.getState().current.live_consistency.deployment_check_id, 101);
  assert.equal(env.getState().current.live_consistency.deployment_id, 'github-check:101');
  assert.deepEqual(env.getState().current.pending_deploy.opportunity_ids, ['opp_b', 'opp_a']);
});

test('deploying production tick fails closed if broker deployment SHA differs from checkpointed merge SHA', async () => {
  const env = makeEnv([verify, deploy]);
  env.GITHUB_PR_BROKER.fetch = async request => {
    const payload = JSON.parse(await request.text());
    assert.equal(payload.action, 'inspect_data_merge_checks');
    return Response.json({ ok: true, deployment: { pr_number: 1701, merge_sha: 'd'.repeat(40), check_runs: [verify, deploy] } });
  };
  await assert.rejects(() => runCloudControllerTick(env, { execute: true }), /production_deploy_inspection_sha_mismatch/);
  assert.equal(env.getCheckpoints(), 0);
});
