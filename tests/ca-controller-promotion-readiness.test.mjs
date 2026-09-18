import assert from 'node:assert/strict';
import test from 'node:test';

import { buildInitialCaControllerState } from '../operations/cloudflare-global-acquisition/lib/ca-cloud-controller.mjs';
import {
  handleCaControllerStateMaintenance,
  PROMOTE_CA_CONFIRMATION
} from '../operations/cloudflare-global-acquisition/lib/ca-controller-state-maintenance.mjs';

const MAIN_SHA = 'b'.repeat(40);
const STATE_SHA = 'a'.repeat(64);
const SNAPSHOT_TEXT = `export const caOpportunitySnapshot = {\n  "exported_at": "2026-09-13T00:00:00.000Z",\n  "source": "canada-shadow-bootstrap",\n  "total": 0,\n  "rows": []\n};\n`;

function base64(value) {
  return Buffer.from(value, 'utf8').toString('base64');
}

function testEnv({ authority = 'shadow', cutover = 'false' } = {}) {
  const state = buildInitialCaControllerState({
    productionCount: 0,
    sourceCount: 0,
    mainSha: '1'.repeat(40),
    now: '2026-09-13T17:00:00.000Z'
  });
  let promoteCalls = 0;
  const stub = {
    async fetch(input) {
      const request = input instanceof Request ? input : new Request(input);
      const url = new URL(request.url);
      if (url.pathname === '/snapshot') {
        return new Response(JSON.stringify(state), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'x-findpitches-state-version': '7',
            'x-findpitches-state-sha256': STATE_SHA,
            'x-findpitches-state-authority': authority,
            'x-findpitches-state-source': 'cloudflare-ca-controller-bootstrap',
            'x-findpitches-state-imported-at': '2026-09-13T17:00:00.000Z'
          }
        });
      }
      if (url.pathname === '/promote') {
        promoteCalls += 1;
        const body = await request.json();
        assert.deepEqual(body, { expected_version: 7, expected_sha256: STATE_SHA });
        return Response.json({ ok: true, changed: true, state: { version: 7, sha256: STATE_SHA, authority: 'authoritative' } });
      }
      throw new Error(`unexpected DO route ${url.pathname}`);
    }
  };

  return {
    env: {
      CONTROLLER_STATE_IMPORT_TOKEN: 'maintenance-secret',
      GITHUB_TOKEN: 'github-token',
      GITHUB_REPO: 'owner/repo',
      GITHUB_PR_BROKER: {
        fetch: async request => {
          const body = await request.json();
          assert.deepEqual(body, { action: 'read_ca_production_bases' });
          return Response.json({
            ok: true,
            bases: { main_sha: MAIN_SHA, production_count: 0, source_count: 0 }
          });
        }
      },
      GLOBAL_CA_CONTROLLER_CUTOVER_ENABLED: cutover,
      CA_CONTROLLER_STATE: {
        idFromName(name) { assert.equal(name, 'ca-controller'); return 'ca-id'; },
        get(id) { assert.equal(id, 'ca-id'); return stub; }
      }
    },
    get promoteCalls() { return promoteCalls; }
  };
}

async function withGithubBases(fn) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/git/ref/heads/main')) return Response.json({ object: { sha: MAIN_SHA } });
    if (url.pathname.endsWith('/contents/functions/_data/ca-opportunities.mjs')) return Response.json({ content: base64(SNAPSHOT_TEXT) });
    if (url.pathname.endsWith('/contents/operations/opportunity-pipeline/config/ca-approved-source-routes.json')) {
      return Response.json({ content: base64('[]\n') });
    }
    throw new Error(`unexpected GitHub request ${url}`);
  };
  try { return await fn(); }
  finally { globalThis.fetch = originalFetch; }
}

function maintenanceRequest(path, options = {}) {
  return new Request(`https://worker.test${path}`, {
    ...options,
    headers: {
      authorization: 'Bearer maintenance-secret',
      'content-type': 'application/json',
      ...(options.headers || {})
    }
  });
}

test('Canada readiness endpoint proves exact live data parity without mutating state', async () => {
  const setup = testEnv();
  await withGithubBases(async () => {
    const response = await handleCaControllerStateMaintenance(
      maintenanceRequest('/ca-controller-state/readiness'),
      setup.env
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.promotion_ready, true);
    assert.equal(body.current_main_sha, MAIN_SHA);
    assert.equal(body.state_base_matches_current_main, false);
    assert.equal(body.production_count_matches, true);
    assert.equal(body.source_count_matches, true);
    assert.equal(setup.promoteCalls, 0);
  });
});

test('Canada promotion requires exact current main SHA and exact state checkpoint', async () => {
  const setup = testEnv();
  await withGithubBases(async () => {
    const response = await handleCaControllerStateMaintenance(
      maintenanceRequest('/ca-controller-state/promote', {
        method: 'POST',
        body: JSON.stringify({
          confirmation: PROMOTE_CA_CONFIRMATION,
          expected_main_sha: MAIN_SHA,
          expected_version: 7,
          expected_sha256: STATE_SHA
        })
      }),
      setup.env
    );
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
    assert.equal(setup.promoteCalls, 1);
  });
});

test('Canada promotion refuses stale main SHA before authority can change', async () => {
  const setup = testEnv();
  await withGithubBases(async () => {
    const response = await handleCaControllerStateMaintenance(
      maintenanceRequest('/ca-controller-state/promote', {
        method: 'POST',
        body: JSON.stringify({
          confirmation: PROMOTE_CA_CONFIRMATION,
          expected_main_sha: 'c'.repeat(40),
          expected_version: 7,
          expected_sha256: STATE_SHA
        })
      }),
      setup.env
    );
    assert.equal(response.status, 409);
    const body = await response.json();
    assert.equal(body.error, 'ca_controller_main_precondition_failed');
    assert.equal(body.current_main_sha, MAIN_SHA);
    assert.equal(setup.promoteCalls, 0);
  });
});

test('Canada promotion refuses to run if cutover is already enabled', async () => {
  const setup = testEnv({ cutover: 'true' });
  await withGithubBases(async () => {
    const response = await handleCaControllerStateMaintenance(
      maintenanceRequest('/ca-controller-state/promote', {
        method: 'POST',
        body: JSON.stringify({
          confirmation: PROMOTE_CA_CONFIRMATION,
          expected_main_sha: MAIN_SHA,
          expected_version: 7,
          expected_sha256: STATE_SHA
        })
      }),
      setup.env
    );
    assert.equal(response.status, 409);
    const body = await response.json();
    assert.equal(body.error, 'ca_controller_cutover_not_ready');
    assert.ok(body.blockers.includes('cutover_already_enabled'));
    assert.equal(setup.promoteCalls, 0);
  });
});
