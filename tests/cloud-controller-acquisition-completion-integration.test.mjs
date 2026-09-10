import test from 'node:test';
import assert from 'node:assert/strict';
import { runCloudControllerTick } from '../operations/cloudflare-global-acquisition/lib/cloud-controller-tick.mjs';

function makeHarness(workflowOutput) {
  let state = {
    status: 'running_cloudflare_acquisition',
    snapshot_count: 704,
    target_count: 1200,
    priority_order: ['TX'],
    priority_cursor: 0,
    query_offsets: { TX: 100 },
    active_instance: {
      id: 'usctl-v40-tx-b1-acquire', mode: 'acquire', state_code: 'TX', state_name: 'Texas',
      worker_version: 'worker-v1', worker_sha: 'f'.repeat(40), started_at: '2026-09-10T12:00:00Z'
    },
    current: { mode: 'discover', state_code: 'TX', source_pr: 1700, discovery_instance_id: 'cf_discovery' },
    pending_source_ids: ['tx-one'],
    acquisition_batch: 1,
    results: [],
    deferred_units: [],
    worker_version: 'worker-v1',
    worker_sha: 'f'.repeat(40)
  };
  let version = 40;
  let sha256 = 'a'.repeat(64);
  const stub = {
    async fetch(input) {
      const url = new URL(typeof input === 'string' ? input : input.url);
      if (url.pathname === '/meta') return Response.json({ ok: true, state: { version, sha256, authority: 'authoritative' } });
      if (url.pathname === '/snapshot') {
        return new Response(`${JSON.stringify(state, null, 2)}\n`, { headers: {
          'x-findpitches-state-version': String(version),
          'x-findpitches-state-sha256': sha256,
          'x-findpitches-state-authority': 'authoritative'
        } });
      }
      if (url.pathname === '/checkpoint' && input.method === 'PUT') {
        assert.equal(input.headers.get('x-findpitches-expected-state-version'), String(version));
        assert.equal(input.headers.get('x-findpitches-expected-state-sha256'), sha256);
        state = JSON.parse(await input.text());
        version += 1;
        sha256 = 'b'.repeat(64);
        return Response.json({ ok: true, changed: true, version, sha256, authority: 'authoritative' }, { status: 201 });
      }
      return new Response('Not found', { status: 404 });
    }
  };
  const env = {
    CONTROLLER_STATE: { idFromName: value => value, get: () => stub },
    GLOBAL_CONTROLLER_CUTOVER_ENABLED: 'true',
    GLOBAL_ACQUISITION_EXECUTION_ENABLED: 'true',
    GLOBAL_ACQUISITION_EXECUTION_LEVEL: 'production',
    GLOBAL_ACQUISITION: {
      async get(id) {
        return { id, async status() { return { status: 'complete', output: workflowOutput }; } };
      }
    }
  };
  return { env, readState: () => structuredClone(state) };
}

test('completed acquisition Workflow is checkpointed through the real cloud controller tick', async () => {
  const harness = makeHarness({
    state_code: 'TX', before: 704, additions: 2, after: 706,
    publication: { pr_number: 1800 }
  });
  const result = await runCloudControllerTick(harness.env, { execute: true });
  assert.equal(result.phase, 'acquisition_workflow_completed');
  assert.equal(result.next_status, 'reviewing_data_pr');
  assert.equal(result.data_pr, 1800);
  assert.equal(result.additions, 2);
  const next = harness.readState();
  assert.equal(next.status, 'reviewing_data_pr');
  assert.equal(next.active_instance, null);
  assert.equal(next.current.acquisition_instance_id, 'usctl-v40-tx-b1-acquire');
  assert.equal(next.current.data_pr, 1800);
  assert.equal(next.results.length, 1);
});

test('completed acquisition Workflow fails closed on authoritative snapshot drift', async () => {
  const harness = makeHarness({
    state_code: 'TX', before: 703, additions: 1, after: 704,
    publication: { pr_number: 1800 }
  });
  await assert.rejects(() => runCloudControllerTick(harness.env, { execute: true }), /acquisition_snapshot_drift/);
  assert.equal(harness.readState().status, 'running_cloudflare_acquisition');
  assert.equal(harness.readState().active_instance.id, 'usctl-v40-tx-b1-acquire');
});
