import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isRecoverableCaPrBrokerFailure,
  recoverFailedCanadaPrBrokerWorkflow
} from '../operations/cloudflare-global-acquisition/lib/ca-pr-broker-recovery.mjs';
import { buildInitialCaControllerState } from '../operations/cloudflare-global-acquisition/lib/ca-cloud-controller.mjs';

function makeEnv(details, { mode = 'discovery' } = {}) {
  let version = 3;
  let sha256 = 'a'.repeat(64);
  let checkpointWrites = 0;
  const state = buildInitialCaControllerState({ mainSha: '1'.repeat(40) });
  state.status = mode === 'discovery' ? 'running_discovery' : 'running_acquisition';
  state.active_instance = {
    id: mode === 'discovery' ? 'cactl-v1-discover-q0-l4' : 'cactl-v8-acquire-c1',
    mode,
    query_offset: mode === 'discovery' ? 0 : null,
    query_limit: mode === 'discovery' ? 4 : null
  };

  const stub = {
    async fetch(input) {
      const request = input instanceof Request ? input : new Request(input);
      const url = new URL(request.url);
      if (request.method === 'GET' && url.pathname === '/snapshot') {
        return new Response(JSON.stringify(state), {
          headers: {
            'content-type': 'application/json',
            'x-findpitches-state-version': String(version),
            'x-findpitches-state-sha256': sha256,
            'x-findpitches-state-authority': 'authoritative'
          }
        });
      }
      if (request.method === 'PUT' && url.pathname === '/checkpoint') {
        assert.equal(request.headers.get('x-findpitches-expected-state-version'), String(version));
        assert.equal(request.headers.get('x-findpitches-expected-state-sha256'), sha256);
        Object.assign(state, JSON.parse(await request.text()));
        checkpointWrites += 1;
        version += 1;
        sha256 = 'b'.repeat(64);
        return Response.json({ ok: true, version, sha256 });
      }
      return new Response('Not found', { status: 404 });
    }
  };

  return {
    env: {
      GLOBAL_CA_CONTROLLER_CUTOVER_ENABLED: 'true',
      CA_CONTROLLER_STATE: {
        idFromName: () => 'ca-controller-id',
        get: () => stub
      },
      GLOBAL_ACQUISITION: {
        get: async id => ({ id, status: async () => details })
      }
    },
    state,
    writes: () => checkpointWrites
  };
}

test('Canada PR broker recovery recognizes only the exact retired branch-policy failure', () => {
  assert.equal(isRecoverableCaPrBrokerFailure({ status: 'errored', error: { message: 'GitHub PR broker failed: internal_github_pr_head_rejected' } }), true);
  assert.equal(isRecoverableCaPrBrokerFailure({ status: 'running' }), false);
  assert.equal(isRecoverableCaPrBrokerFailure({ status: 'errored', error: { message: 'github_pr_http_500' } }), false);
});

test('Canada PR broker recovery replays the exact failed discovery checkpoint without advancing the query offset', async () => {
  const fixture = makeEnv({ status: 'errored', error: { message: 'GitHub PR broker failed: internal_github_pr_head_rejected' } });
  const result = await recoverFailedCanadaPrBrokerWorkflow(fixture.env);
  assert.equal(result.recovered, true);
  assert.equal(result.workflow_id, 'cactl-v1-discover-q0-l4');
  assert.equal(result.state_status, 'ready_discovery');
  assert.equal(fixture.state.status, 'ready_discovery');
  assert.equal(fixture.state.active_instance, null);
  assert.equal(fixture.state.query_offset, 0);
  assert.equal(fixture.writes(), 1);
});

test('Canada PR broker recovery does not mutate a still-running workflow', async () => {
  const fixture = makeEnv({ status: 'running' });
  const result = await recoverFailedCanadaPrBrokerWorkflow(fixture.env);
  assert.equal(result.pending, true);
  assert.equal(result.recovered, false);
  assert.equal(fixture.state.status, 'running_discovery');
  assert.equal(fixture.writes(), 0);
});

test('Canada PR broker recovery fails closed for unrelated terminal failures', async () => {
  const fixture = makeEnv({ status: 'errored', error: { message: 'some_other_failure' } });
  await assert.rejects(() => recoverFailedCanadaPrBrokerWorkflow(fixture.env), /ca_pr_broker_recovery_terminal_unmatched/);
  assert.equal(fixture.writes(), 0);
});
