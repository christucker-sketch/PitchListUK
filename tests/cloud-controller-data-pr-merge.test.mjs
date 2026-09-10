import test from 'node:test';
import assert from 'node:assert/strict';
import { runCloudControllerTick } from '../operations/cloudflare-global-acquisition/lib/cloud-controller-tick.mjs';

const baseSha = 'b'.repeat(40);
const headSha = 'a'.repeat(40);
const mergeSha = 'c'.repeat(40);
const promotionSha = 'd'.repeat(64);
const branch = `data/cloud-texas-growth-${promotionSha.slice(0, 16)}-base-${baseSha.slice(0, 16)}`;

function initialState() {
  return {
    status: 'reviewing_data_pr', snapshot_count: 704, target_count: 1200,
    priority_order: ['TX'], priority_cursor: 0, query_offsets: { TX: 12 },
    current: {
      mode: 'acquire', state_code: 'TX', discovery_instance_id: 'cf_discovery', source_pr: 1700,
      acquisition_instance_id: 'cf_acq', data_pr: 1701
    },
    active_instance: null, pending_source_ids: ['src_a'], acquisition_batch: 1,
    state_totals: { TX: 40 }, deferred_units: [],
    results: [{
      instance_id: 'cf_acq', state_name: 'Texas', state_code: 'TX',
      staged_count: 2, evidence_passed_count: 2,
      before: 704, after: 706, additions: 2,
      promotion_rows_sha256: promotionSha,
      publication: { pr_number: 1701, branch }
    }]
  };
}

function makeEnv() {
  let state = initialState();
  let version = 30;
  let sha = '1'.repeat(64);
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
        version += 1;
        sha = String(version).padStart(64, '0');
        return Response.json({ ok: true, changed: true, version, sha256: sha }, { status: 201 });
      }
      return new Response('not found', { status: 404 });
    }
  };
  let mergeCalls = 0;
  const broker = {
    async fetch(request) {
      const payload = JSON.parse(await request.text());
      if (payload.action === 'inspect') return Response.json({ ok: true, pr: {
        number: 1701, state: 'OPEN', merged: false, draft: false,
        base_ref: 'main', base_sha: baseSha, head_ref: branch, head_sha: headSha,
        commits: [{ sha: headSha, parents: [baseSha] }],
        files: [{ path: 'functions/_data/us-opportunities.mjs' }],
        check_runs: [{ status: 'completed', conclusion: 'success' }],
        data_snapshot_proof: {
          additions_only: true, base_count: 704, head_count: 706,
          added_count: 2, added_ids: ['opp_b', 'opp_a']
        },
        body: [
          '- state: Texas (TX)',
          '- production snapshot: 704 -> 706',
          '- net-new additions: 2',
          `- promotion rows SHA256: ${promotionSha}`,
          '- deterministic evidence receipts: 2/2 passed',
          '- no automatic merge or deploy requested'
        ].join('\n')
      }});
      if (payload.action === 'merge') {
        mergeCalls += 1;
        assert.equal(payload.pr_number, 1701);
        assert.equal(payload.expected_base_sha, baseSha);
        assert.equal(payload.expected_head_sha, headSha);
        return Response.json({ ok: true, merged: true, reused: false, pr_number: 1701, merge_sha: mergeSha });
      }
      return Response.json({ ok: false }, { status: 400 });
    }
  };
  return {
    CONTROLLER_STATE: { idFromName: value => value, get: () => stateStub },
    GITHUB_PR_BROKER: broker,
    GLOBAL_ACQUISITION_EXECUTION_ENABLED: 'true',
    GLOBAL_ACQUISITION_EXECUTION_LEVEL: 'production',
    GLOBAL_CONTROLLER_CUTOVER_ENABLED: 'true',
    getState: () => state,
    getMergeCalls: () => mergeCalls
  };
}

test('data PR transition reserves exact compact proof before merge then checkpoints pending production deploy', async () => {
  const env = makeEnv();
  const reserved = await runCloudControllerTick(env, { execute: true });
  assert.equal(reserved.phase, 'data_pr_merge_reserved');
  assert.equal(env.getMergeCalls(), 0);
  assert.equal(env.getState().status, 'reviewing_data_pr');
  assert.equal(env.getState().snapshot_count, 704);
  assert.equal(env.getState().cloud_controller_intent.head_sha, headSha);
  assert.equal(env.getState().cloud_controller_intent.base_sha, baseSha);
  assert.equal(env.getState().cloud_controller_intent.before, 704);
  assert.equal(env.getState().cloud_controller_intent.after, 706);
  assert.equal(env.getState().cloud_controller_intent.additions, 2);
  assert.deepEqual(env.getState().cloud_controller_intent.opportunity_ids, ['opp_a', 'opp_b']);

  const merged = await runCloudControllerTick(env, { execute: true });
  assert.equal(merged.phase, 'data_pr_merged');
  assert.equal(env.getMergeCalls(), 1);
  assert.equal(env.getState().status, 'deploying_production');
  assert.equal(env.getState().snapshot_count, 706);
  assert.equal(env.getState().state_totals.TX, 42);
  assert.equal(env.getState().cloud_controller_intent, undefined);
  assert.deepEqual(env.getState().current.pending_deploy, {
    sha: mergeSha,
    count: 706,
    previous_count: 704,
    additions: 2,
    opportunity_ids: ['opp_a', 'opp_b'],
    pr_number: 1701
  });
});
