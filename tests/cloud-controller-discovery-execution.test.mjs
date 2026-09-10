import test from 'node:test';
import assert from 'node:assert/strict';

import { runCloudControllerTick } from '../operations/cloudflare-global-acquisition/lib/cloud-controller-tick.mjs';

function makeHarness(initialState) {
  let state = structuredClone(initialState);
  let version = 20;
  let sha256 = 'a'.repeat(64);
  const created = [];

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
    GLOBAL_ACQUISITION: {
      async createBatch(items) {
        created.push(...items);
        return items.map(item => ({ id: item.id }));
      },
      async get(id) { return { id }; }
    }
  };

  return { env, created, readState: () => structuredClone(state) };
}

const initialState = {
  status: 'ready',
  snapshot_count: 704,
  target_count: 1200,
  priority_order: ['MA'],
  priority_cursor: 0,
  query_offsets: { MA: 72 },
  active_instance: null,
  current: null,
  pending_source_ids: [],
  acquisition_batch: 1,
  deferred_units: [],
  worker_version: 'worker-v1',
  worker_sha: 'f'.repeat(40)
};

test('discovery execution reserves first, then idempotently binds one deterministic Workflow', async () => {
  const harness = makeHarness(initialState);

  const reserved = await runCloudControllerTick(harness.env, { execute: true });
  assert.equal(reserved.phase, 'reserved');
  assert.equal(harness.created.length, 0);
  assert.equal(harness.readState().status, 'ready');
  assert.equal(harness.readState().cloud_controller_intent.phase, 'reserved');
  const workflowId = harness.readState().cloud_controller_intent.workflow_id;
  assert.match(workflowId, /^usctl-v20-ma-q72-l4$/);

  const bound = await runCloudControllerTick(harness.env, { execute: true });
  assert.equal(bound.phase, 'workflow_bound');
  assert.equal(bound.workflow_id, workflowId);
  assert.equal(harness.created.length, 1);
  assert.equal(harness.created[0].id, workflowId);
  assert.equal(harness.created[0].params.country, 'US');
  assert.equal(harness.created[0].params.mode, 'discover');
  assert.equal(harness.created[0].params.state_code, 'MA');
  assert.equal(harness.created[0].params.query_offset, 72);
  assert.equal(harness.created[0].params.query_limit, 4);

  const finalState = harness.readState();
  assert.equal(finalState.status, 'running_cloudflare_discovery');
  assert.equal(finalState.active_instance.id, workflowId);
  assert.equal(finalState.current.state_code, 'MA');
  assert.equal(finalState.cloud_controller_intent, undefined);
});
