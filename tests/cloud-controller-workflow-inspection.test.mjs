import test from 'node:test';
import assert from 'node:assert/strict';

import { runCloudControllerTick } from '../operations/cloudflare-global-acquisition/lib/cloud-controller-tick.mjs';

function harness(workflowStatus) {
  let state = {
    status: 'running_cloudflare_discovery', snapshot_count: 704, target_count: 1200,
    priority_order: ['MA'], priority_cursor: 0, query_offsets: { MA: 72 },
    current: { mode: 'discover', state_code: 'MA', query_offset: 72, query_limit: 4, plan_size: 144, next_priority_cursor: 1 },
    active_instance: { id: 'usctl-v20-ma-q72-l4', mode: 'discover', state_code: 'MA', state_name: 'Massachusetts', worker_version: 'v1', worker_sha: 'f'.repeat(40) },
    pending_source_ids: [], acquisition_batch: 1, deferred_units: [], results: []
  };
  let version = 21;
  let sha256 = 'a'.repeat(64);
  let writes = 0;

  const stub = {
    async fetch(input) {
      const url = new URL(typeof input === 'string' ? input : input.url);
      if (url.pathname === '/meta') return Response.json({ ok: true, state: { version, sha256, authority: 'authoritative' } });
      if (url.pathname === '/snapshot') return new Response(`${JSON.stringify(state)}\n`, { headers: {
        'x-findpitches-state-version': String(version),
        'x-findpitches-state-sha256': sha256,
        'x-findpitches-state-authority': 'authoritative'
      }});
      if (url.pathname === '/checkpoint') {
        state = JSON.parse(await input.text());
        version += 1;
        sha256 = 'b'.repeat(64);
        writes += 1;
        return Response.json({ ok: true, changed: true, version, sha256 }, { status: 201 });
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
      async get(id) { return { id, async status() { return workflowStatus; } }; }
    }
  };
  return { env, state: () => structuredClone(state), writes: () => writes };
}

test('running active Workflow is observed without mutating controller state', async () => {
  const h = harness({ status: 'running' });
  const result = await runCloudControllerTick(h.env, { execute: true });
  assert.equal(result.phase, 'workflow_observed');
  assert.equal(result.workflow_status, 'running');
  assert.equal(h.writes(), 0);
  assert.equal(h.state().status, 'running_cloudflare_discovery');
});

test('completed discovery Workflow checkpoints the next source-review state', async () => {
  const output = {
    state_code: 'MA', state_name: 'Massachusetts', next_query_offset: 76,
    publication: { source_count: 2, source_ids: ['a', 'b'], pr_number: 1700 }
  };
  const h = harness({ status: 'complete', output });
  const result = await runCloudControllerTick(h.env, { execute: true });
  assert.equal(result.phase, 'workflow_completed');
  assert.equal(result.next_status, 'reviewing_source_pr');
  assert.equal(h.writes(), 1);
  const state = h.state();
  assert.equal(state.active_instance, null);
  assert.equal(state.query_offsets.MA, 76);
  assert.equal(state.priority_cursor, 1);
  assert.equal(state.current.source_pr, 1700);
  assert.equal(state.current.discovery_instance_id, 'usctl-v20-ma-q72-l4');
  assert.equal(state.status, 'reviewing_source_pr');
  assert.equal(state.results.at(-1).instance_id, 'usctl-v20-ma-q72-l4');
});
