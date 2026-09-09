import assert from 'node:assert/strict';
import test from 'node:test';

import { handleControllerStateMaintenance } from '../operations/cloudflare-global-acquisition/lib/controller-state-maintenance.mjs';

function fakeEnv({ token = 'correct-token' } = {}) {
  const calls = [];
  const stub = {
    async fetch(request) {
      const normalized = request instanceof Request ? request : new Request(request);
      calls.push({ method: normalized.method, url: normalized.url, headers: Object.fromEntries(normalized.headers) });
      if (normalized.method === 'GET' && normalized.url.endsWith('/meta')) return Response.json({ ok: true, state: { authority: 'shadow' } });
      if (normalized.method === 'GET' && normalized.url.endsWith('/snapshot')) return new Response('{"priority_order":[]}');
      if (normalized.method === 'PUT') {
        return Response.json({
          ok: true,
          authority: normalized.headers.get('x-findpitches-state-authority'),
          source: normalized.headers.get('x-findpitches-state-source')
        }, { status: 201 });
      }
      return new Response('Not found', { status: 404 });
    }
  };
  return {
    env: {
      CONTROLLER_STATE_IMPORT_TOKEN: token,
      CONTROLLER_STATE: {
        idFromName(name) { assert.equal(name, 'us-controller'); return 'us-controller-id'; },
        get(id) { assert.equal(id, 'us-controller-id'); return stub; }
      }
    },
    calls
  };
}

test('maintenance route is disabled when no import token is configured', async () => {
  const { env } = fakeEnv({ token: '' });
  const response = await handleControllerStateMaintenance(new Request('https://example.test/controller-state/meta'), env);
  assert.equal(response.status, 404);
});

test('maintenance route rejects an incorrect bearer token', async () => {
  const { env, calls } = fakeEnv();
  const response = await handleControllerStateMaintenance(new Request('https://example.test/controller-state/meta', {
    headers: { authorization: 'Bearer wrong-token' }
  }), env);
  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);
});

test('authenticated metadata reads are forwarded to the US controller durable object', async () => {
  const { env, calls } = fakeEnv();
  const response = await handleControllerStateMaintenance(new Request('https://example.test/controller-state/meta', {
    headers: { authorization: 'Bearer correct-token' }
  }), env);
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://controller-state.internal/meta');
});

test('snapshot imports are forced to Hal source and shadow authority', async () => {
  const { env, calls } = fakeEnv();
  const response = await handleControllerStateMaintenance(new Request('https://example.test/controller-state/snapshot', {
    method: 'PUT',
    headers: {
      authorization: 'Bearer correct-token',
      'content-type': 'application/json',
      'x-findpitches-state-authority': 'authoritative'
    },
    body: '{"priority_order":[]}'
  }), env);
  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.equal(payload.authority, 'shadow');
  assert.equal(payload.source, 'hal-us-growth');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].headers['x-findpitches-state-authority'], 'shadow');
  assert.equal(calls[0].headers['x-findpitches-state-source'], 'hal-us-growth');
});
