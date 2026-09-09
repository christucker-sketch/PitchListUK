import test from 'node:test';
import assert from 'node:assert/strict';

import { handleControllerStateMaintenance } from '../operations/cloudflare-global-acquisition/lib/controller-state-maintenance.mjs';

function envFor(snapshot) {
  const internalHeaders = new Headers({
    'x-findpitches-state-sha256': 'abc123',
    'x-findpitches-state-version': '7'
  });
  const stub = {
    async fetch(url) {
      if (String(url).endsWith('/snapshot')) {
        return new Response(JSON.stringify(snapshot), { status: 200, headers: internalHeaders });
      }
      return Response.json({ ok: true, state: null });
    }
  };
  return {
    CONTROLLER_STATE_IMPORT_TOKEN: 'secret',
    CONTROLLER_STATE: {
      idFromName: value => value,
      get: () => stub
    }
  };
}

test('decision endpoint returns shadow decision without mutating state', async () => {
  const snapshot = {
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
    deferred_units: []
  };
  const request = new Request('https://example.test/controller-state/decision', {
    headers: { authorization: 'Bearer secret' }
  });
  const response = await handleControllerStateMaintenance(request, envFor(snapshot));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.authority, 'shadow');
  assert.equal(body.state_sha256, 'abc123');
  assert.equal(body.state_version, 7);
  assert.equal(body.decision.action, 'trigger_discovery');
  assert.equal(body.decision.state_code, 'MA');
  assert.equal(body.decision.query_offset, 72);
});
