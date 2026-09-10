import test from 'node:test';
import assert from 'node:assert/strict';

import { acquisitionSourceIdBatches, runCloudControllerTick } from '../operations/cloudflare-global-acquisition/lib/cloud-controller-tick.mjs';

function makeHarness(initialState, { deployReady = true } = {}) {
  let state = structuredClone(initialState);
  let version = 30;
  let sha256 = 'a'.repeat(64);
  const created = [];
  const brokerCalls = [];

  const stub = {
    async fetch(input) {
      const url = new URL(typeof input === 'string' ? input : input.url);
      if (url.pathname === '/meta') {
        return Response.json({ ok: true, state: { version, sha256, authority: 'authoritative' } });
      }
      if (url.pathname === '/snapshot') {
        return new Response(`${JSON.stringify(state, null, 2)}\n`, {
          status: 200,
          headers: {
            'x-findpitches-state-version': String(version),
            'x-findpitches-state-sha256': sha256,
            'x-findpitches-state-authority': 'authoritative'
          }
        });
      }
      if (url.pathname === '/checkpoint' && input.method === 'PUT') {
        assert.equal(input.headers.get('x-findpitches-expected-state-version'), String(version));
        assert.equal(input.headers.get('x-findpitches-expected-state-sha256'), sha256);
        state = JSON.parse(await input.text());
        version += 1;
        sha256 = String(version).padStart(64, 'b').slice(-64);
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
    GITHUB_PR_BROKER: {
      async fetch(request) {
        const payload = await request.json();
        brokerCalls.push(payload);
        if (payload.action !== 'inspect_merge_checks') return Response.json({ ok: false, error: 'unexpected' }, { status: 400 });
        return Response.json({
          ok: true,
          deployment: {
            pr_number: payload.pr_number,
            merge_sha: 'c'.repeat(40),
            check_runs: deployReady ? [
              { name: 'verify', status: 'completed', conclusion: 'success' },
              { name: 'deploy_acquisition_worker_production', status: 'completed', conclusion: 'success' }
            ] : [
              { name: 'verify', status: 'completed', conclusion: 'success' },
              { name: 'deploy_acquisition_worker_production', status: 'in_progress', conclusion: null }
            ]
          }
        });
      }
    },
    GLOBAL_ACQUISITION: {
      async createBatch(items) {
        created.push(...items);
        return items.map(item => ({ id: item.id }));
      },
      async get(id) { return { id }; }
    }
  };

  return { env, created, brokerCalls, readState: () => structuredClone(state) };
}

function readyState(code = 'MA', ids = ['ma-one','ma-two','ma-three','ma-four','ma-five']) {
  return {
    status: 'ready_acquisition',
    snapshot_count: 704,
    target_count: 1200,
    priority_order: [code],
    priority_cursor: 0,
    query_offsets: { [code]: 144 },
    active_instance: null,
    current: { mode: 'discover', state_code: code, source_pr: 1700, discovery_instance_id: 'cf_discovery' },
    pending_source_ids: ids,
    acquisition_batch: 1,
    deferred_units: [],
    worker_version: 'worker-v1',
    worker_sha: 'f'.repeat(40)
  };
}

test('acquisition batching preserves state caps, including CT single-source batches', () => {
  assert.deepEqual(acquisitionSourceIdBatches(readyState('MA')), [
    ['ma-one','ma-two','ma-three','ma-four'],
    ['ma-five']
  ]);
  assert.deepEqual(acquisitionSourceIdBatches(readyState('CT', ['ct-one','ct-two'])), [['ct-one'], ['ct-two']]);
});

test('ready acquisition waits without mutation until merged source Worker deployment is proven', async () => {
  const harness = makeHarness(readyState(), { deployReady: false });
  const result = await runCloudControllerTick(harness.env, { execute: true });
  assert.equal(result.executed, false);
  assert.equal(result.phase, 'waiting_for_acquisition_worker_deploy');
  assert.equal(harness.created.length, 0);
  assert.equal(harness.readState().cloud_controller_intent, undefined);
  assert.equal(harness.readState().status, 'ready_acquisition');
});

test('acquisition execution reserves first then binds one deterministic exact-source Workflow', async () => {
  const harness = makeHarness(readyState());
  const reserved = await runCloudControllerTick(harness.env, { execute: true });
  assert.equal(reserved.phase, 'acquisition_reserved');
  assert.deepEqual(reserved.source_ids, ['ma-one','ma-two','ma-three','ma-four']);
  assert.equal(harness.created.length, 0);
  const workflowId = harness.readState().cloud_controller_intent.workflow_id;
  assert.match(workflowId, /^usctl-v30-ma-b1-acquire$/);

  const bound = await runCloudControllerTick(harness.env, { execute: true });
  assert.equal(bound.phase, 'acquisition_workflow_bound');
  assert.equal(bound.workflow_id, workflowId);
  assert.equal(harness.created.length, 1);
  assert.equal(harness.created[0].id, workflowId);
  assert.equal(harness.created[0].params.country, 'US');
  assert.equal(harness.created[0].params.mode, 'acquire');
  assert.equal(harness.created[0].params.state_code, 'MA');
  assert.equal(harness.created[0].params.batch_number, 1);
  assert.deepEqual(harness.created[0].params.source_ids, ['ma-one','ma-two','ma-three','ma-four']);
  assert.equal(harness.readState().status, 'running_cloudflare_acquisition');
  assert.equal(harness.readState().active_instance.id, workflowId);
  assert.equal(harness.readState().cloud_controller_intent, undefined);
});

test('ready acquisition advances back to ready after all batches are consumed', async () => {
  const state = readyState('MA', ['ma-one']);
  state.acquisition_batch = 2;
  const harness = makeHarness(state);
  const result = await runCloudControllerTick(harness.env, { execute: true });
  assert.equal(result.phase, 'acquisition_batches_complete');
  assert.equal(harness.readState().status, 'ready');
  assert.deepEqual(harness.readState().pending_source_ids, []);
  assert.equal(harness.readState().current, null);
  assert.equal(harness.created.length, 0);
});
