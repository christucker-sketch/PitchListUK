import assert from 'node:assert/strict';
import test from 'node:test';

import { buildInitialCaControllerState } from '../operations/cloudflare-global-acquisition/lib/ca-cloud-controller.mjs';
import {
  CA_AUTHORITY_PROMOTION_CONFIRMATION,
  promoteCanadaShadowAuthority
} from '../operations/cloudflare-global-acquisition/lib/ca-controller-cutover-operator.mjs';

const MAIN_SHA = 'b'.repeat(40);
const STATE_SHA = 'a'.repeat(64);
const SNAPSHOT_TEXT = `export const caOpportunitySnapshot = {\n  "exported_at": "2026-09-14T00:00:00.000Z",\n  "source": "canada-shadow-bootstrap",\n  "total": 0,\n  "rows": []\n};\n`;

function base64(value) {
  return Buffer.from(value, 'utf8').toString('base64');
}

function setup({ cutover = 'false', driftAfterPromotion = false } = {}) {
  const state = buildInitialCaControllerState({
    productionCount: 0,
    sourceCount: 0,
    mainSha: '1'.repeat(40),
    now: '2026-09-14T08:00:00.000Z'
  });
  let authority = 'shadow';
  let promoteCalls = 0;
  let demoteCalls = 0;

  const stub = {
    async fetch(input) {
      const request = input instanceof Request ? input : new Request(input);
      const path = new URL(request.url).pathname;
      if (path === '/snapshot') {
        return new Response(JSON.stringify(state), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'x-findpitches-state-version': '7',
            'x-findpitches-state-sha256': STATE_SHA,
            'x-findpitches-state-authority': authority,
            'x-findpitches-state-source': authority === 'shadow' ? 'cloudflare-ca-controller-bootstrap' : 'cloudflare-ca-controller-cutover',
            'x-findpitches-state-imported-at': '2026-09-14T08:00:00.000Z'
          }
        });
      }
      if (path === '/promote') {
        const body = await request.json();
        assert.deepEqual(body, { expected_version: 7, expected_sha256: STATE_SHA });
        assert.equal(authority, 'shadow');
        authority = 'authoritative';
        promoteCalls += 1;
        return Response.json({ ok: true, changed: true, state: { version: 7, sha256: STATE_SHA, authority } });
      }
      if (path === '/demote') {
        const body = await request.json();
        assert.deepEqual(body, { expected_version: 7, expected_sha256: STATE_SHA });
        authority = 'shadow';
        demoteCalls += 1;
        return Response.json({ ok: true, changed: true, state: { version: 7, sha256: STATE_SHA, authority } });
      }
      throw new Error(`unexpected DO route ${path}`);
    }
  };

  return {
    env: {
      GITHUB_TOKEN: 'github-token',
      GITHUB_REPO: 'owner/repo',
      GITHUB_PR_BROKER: {
        fetch: async request => {
          const body = await request.json();
          assert.deepEqual(body, { action: 'read_ca_production_bases' });
          const sourceCount = driftAfterPromotion && authority === 'authoritative' ? 1 : 0;
          return Response.json({
            ok: true,
            bases: { main_sha: MAIN_SHA, production_count: 0, source_count: sourceCount }
          });
        }
      },
      GLOBAL_CA_CONTROLLER_CUTOVER_ENABLED: cutover,
      CA_CONTROLLER_STATE: {
        idFromName(name) { assert.equal(name, 'ca-controller'); return 'ca-id'; },
        get(id) { assert.equal(id, 'ca-id'); return stub; }
      }
    },
    get authority() { return authority; },
    get promoteCalls() { return promoteCalls; },
    get demoteCalls() { return demoteCalls; },
    driftAfterPromotion
  };
}

async function withGithub(setupState, fn) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/git/ref/heads/main')) return Response.json({ object: { sha: MAIN_SHA } });
    if (url.pathname.endsWith('/contents/functions/_data/ca-opportunities.mjs')) return Response.json({ content: base64(SNAPSHOT_TEXT) });
    if (url.pathname.endsWith('/contents/operations/opportunity-pipeline/config/ca-approved-source-routes.json')) {
      const sources = setupState.driftAfterPromotion && setupState.authority === 'authoritative'
        ? [{ id: 'CA-SRC-DRIFT' }]
        : [];
      return Response.json({ content: base64(`${JSON.stringify(sources)}\n`) });
    }
    throw new Error(`unexpected GitHub request ${url}`);
  };
  try { return await fn(); }
  finally { globalThis.fetch = originalFetch; }
}

function payload(overrides = {}) {
  return {
    confirmation: CA_AUTHORITY_PROMOTION_CONFIRMATION,
    expected_main_sha: MAIN_SHA,
    expected_version: 7,
    expected_sha256: STATE_SHA,
    ...overrides
  };
}

test('Canada authority promotion changes only authority metadata and leaves cutover off', async () => {
  const state = setup();
  await withGithub(state, async () => {
    const result = await promoteCanadaShadowAuthority(state.env, payload());
    assert.equal(result.ok, true);
    assert.equal(result.changed, true);
    assert.equal(result.authority, 'authoritative');
    assert.equal(result.cutover_enabled, false);
    assert.equal(result.launch_ready, true);
    assert.equal(result.authority_metadata_mutation_attempted, true);
    assert.equal(result.opportunity_data_mutation_attempted, false);
    assert.equal(result.acquisition_started, false);
    assert.equal(result.state_version, 7);
    assert.equal(result.state_sha256, STATE_SHA);
    assert.equal(state.promoteCalls, 1);
    assert.equal(state.demoteCalls, 0);
  });
});

test('Canada authority promotion requires the exact explicit confirmation', async () => {
  const state = setup();
  await assert.rejects(
    () => withGithub(state, () => promoteCanadaShadowAuthority(state.env, payload({ confirmation: 'SEND_IT' }))),
    /ca_authority_operator_confirmation_required/
  );
  assert.equal(state.promoteCalls, 0);
});

test('Canada authority promotion refuses cutover-enabled policy before mutation', async () => {
  const state = setup({ cutover: 'true' });
  await assert.rejects(
    () => withGithub(state, () => promoteCanadaShadowAuthority(state.env, payload())),
    /ca_authority_operator_requires_cutover_disabled/
  );
  assert.equal(state.promoteCalls, 0);
});

test('Canada authority promotion binds to exact live main and state identity', async () => {
  const state = setup();
  await assert.rejects(
    () => withGithub(state, () => promoteCanadaShadowAuthority(state.env, payload({ expected_main_sha: 'c'.repeat(40) }))),
    /ca_authority_operator_main_sha_drift/
  );
  await assert.rejects(
    () => withGithub(state, () => promoteCanadaShadowAuthority(state.env, payload({ expected_sha256: 'd'.repeat(64) }))),
    /ca_authority_operator_state_drift/
  );
  assert.equal(state.promoteCalls, 0);
});

test('post-promotion readiness drift automatically rolls authority back to shadow', async () => {
  const state = setup({ driftAfterPromotion: true });
  await assert.rejects(
    () => withGithub(state, () => promoteCanadaShadowAuthority(state.env, payload())),
    /ca_authority_operator_postcheck_failed:.*source_count_mismatch.*rolled_back_to_shadow/
  );
  assert.equal(state.promoteCalls, 1);
  assert.equal(state.demoteCalls, 1);
  assert.equal(state.authority, 'shadow');
});
