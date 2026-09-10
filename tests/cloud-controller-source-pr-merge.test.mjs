import test from 'node:test';
import assert from 'node:assert/strict';
import { runCloudControllerTick } from '../operations/cloudflare-global-acquisition/lib/cloud-controller-tick.mjs';

const baseSha = 'b'.repeat(40);
const headSha = 'a'.repeat(40);

function initialState() {
  return {
    status: 'reviewing_source_pr', snapshot_count: 704, target_count: 1200,
    priority_order: ['TX'], priority_cursor: 0, query_offsets: { TX: 12 },
    current: { mode: 'discover', state_code: 'TX', discovery_instance_id: 'cf_demo', source_pr: 1700 },
    active_instance: null, pending_source_ids: [], acquisition_batch: 9, deferred_units: [],
    results: [{
      instance_id: 'cf_demo', state_name: 'Texas', state_code: 'TX', generated_source_count: 1, evidence_passed_count: 1,
      publication: { pr_number: 1700, source_count: 1, source_ids: ['src_new'] }
    }]
  };
}

function makeEnv() {
  let state = initialState();
  let version = 20;
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
        number: 1700, state: 'OPEN', merged: false, draft: false,
        base_ref: 'main', base_sha: baseSha, head_ref: 'sources/cloud-us-tx-demo', head_sha: headSha,
        commits: [{ sha: headSha, parents: [baseSha] }],
        files: [{ path: 'operations/opportunity-pipeline/config/us-growth-source-registry.json' }],
        check_runs: [{ status: 'completed', conclusion: 'success' }],
        source_registry_proof: { additions_only: true, base_count: 100, head_count: 101, added_count: 1, added_ids: ['src_new'] },
        body: [
          '- state: Texas (TX)',
          '- net-new approved sources: 1',
          '- deterministic source evidence receipts: 1/1 passed',
          '- additions only; no source removals',
          '- no automatic merge or deploy requested',
          '  - src_new: receipt'
        ].join('\n')
      }});
      if (payload.action === 'merge') {
        mergeCalls += 1;
        assert.equal(payload.expected_base_sha, baseSha);
        assert.equal(payload.expected_head_sha, headSha);
        return Response.json({ ok: true, merged: true, reused: false, pr_number: 1700, merge_sha: 'c'.repeat(40) });
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

test('source PR transition reserves exact evidence before merge then checkpoints Hal-compatible ready_acquisition state', async () => {
  const env = makeEnv();
  const reserved = await runCloudControllerTick(env, { execute: true });
  assert.equal(reserved.phase, 'source_pr_merge_reserved');
  assert.equal(env.getMergeCalls(), 0);
  assert.equal(env.getState().cloud_controller_intent.head_sha, headSha);
  assert.deepEqual(env.getState().cloud_controller_intent.source_ids, ['src_new']);

  const merged = await runCloudControllerTick(env, { execute: true });
  assert.equal(merged.phase, 'source_pr_merged');
  assert.equal(env.getMergeCalls(), 1);
  assert.equal(env.getState().status, 'ready_acquisition');
  assert.deepEqual(env.getState().pending_source_ids, ['src_new']);
  assert.equal(env.getState().acquisition_batch, 1);
  assert.equal(env.getState().cloud_controller_intent, undefined);
  assert.equal(env.getState().current.source_pr, 1700);
});
