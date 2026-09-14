import assert from 'node:assert/strict';
import test from 'node:test';

import {
  readUkControllerReadonlyReceipt,
  ukControllerReadonlyDecision
} from '../operations/cloudflare-global-acquisition/lib/uk-controller-readonly-receipt.mjs';

test('UK controller read-only receipt exposes exact pending data PR state without mutation', async () => {
  const state = {
    controller_kind: 'uk',
    status: 'reviewing_data_pr',
    query_offset: 28,
    query_limit: 4,
    plan_size: 96,
    cycle: 2,
    active_instance: null,
    cloud_controller_intent: null,
    pending_source_pr: null,
    pending_data_pr: { pr_number: 1477, workflow_id: 'ukctl-v99-acquire-c2' },
    pending_deployment: null,
    production_count: 289,
    source_count: 70,
    base_main_sha: 'a'.repeat(40),
    totals: { acquisition_runs: 12, opportunity_additions: 1, data_prs_merged: 0 },
    last_acquisition: {
      workflow_id: 'ukctl-v99-acquire-c2',
      result: {
        generated_at: '2026-09-14T12:00:00.000Z',
        manifest_additions: 1,
        production_count_before: 289,
        production_count_after_planned: 290,
        opportunity_pr: { pr_number: 1477 }
      }
    },
    updated_at: '2026-09-14T12:01:00.000Z'
  };
  let fetchCount = 0;
  const env = {
    UK_CONTROLLER_STATE: {
      idFromName(name) {
        assert.equal(name, 'uk-controller');
        return 'uk-controller-id';
      },
      get(id) {
        assert.equal(id, 'uk-controller-id');
        return {
          async fetch(url) {
            fetchCount += 1;
            assert.equal(String(url), 'https://uk-controller-state.internal/snapshot');
            return new Response(JSON.stringify(state), {
              headers: {
                'x-findpitches-state-version': '99',
                'x-findpitches-state-sha256': 'b'.repeat(64),
                'x-findpitches-state-authority': 'authoritative',
                'x-findpitches-state-source': 'cloudflare-uk-controller',
                'x-findpitches-state-imported-at': '2026-09-14T12:01:00.000Z'
              }
            });
          }
        };
      }
    }
  };

  const receipt = await readUkControllerReadonlyReceipt(env);
  assert.equal(fetchCount, 1);
  assert.equal(receipt.available, true);
  assert.equal(receipt.authority, 'authoritative');
  assert.equal(receipt.state_version, 99);
  assert.equal(receipt.status, 'reviewing_data_pr');
  assert.equal(receipt.production_count, 289);
  assert.equal(receipt.source_count, 70);
  assert.equal(receipt.pending_data_pr.pr_number, 1477);
  assert.deepEqual(receipt.decision, { action: 'review_data_pr', pr_number: 1477 });
  assert.equal(receipt.last_acquisition.manifest_additions, 1);
  assert.equal(receipt.last_acquisition.production_count_after_planned, 290);
});

test('UK controller read-only receipt fails harmlessly when binding is unavailable', async () => {
  assert.deepEqual(await readUkControllerReadonlyReceipt({}), {
    available: false,
    reason: 'uk_controller_state_binding_missing'
  });
});

test('UK controller read-only decision mirrors reserved and active controller phases', () => {
  assert.deepEqual(ukControllerReadonlyDecision({
    cloud_controller_intent: { phase: 'reserved', action: 'start_acquisition', workflow_id: 'ukctl-v8-acquire-c1' }
  }), { action: 'bind_reserved_acquisition', workflow_id: 'ukctl-v8-acquire-c1' });
  assert.deepEqual(ukControllerReadonlyDecision({
    active_instance: { id: 'ukctl-v9-discover-q4-l4', mode: 'discovery' }
  }), { action: 'inspect_active_workflow', workflow_id: 'ukctl-v9-discover-q4-l4', mode: 'discovery' });
});
