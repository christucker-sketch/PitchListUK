import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildInitialCaControllerState,
  caControllerDecision,
  globalCaControllerCutoverEnabled
} from '../operations/cloudflare-global-acquisition/lib/ca-cloud-controller.mjs';
import { validateControllerStateText } from '../operations/cloudflare-global-acquisition/lib/controller-state-codec.mjs';

test('Canada controller starts as a clean discovery-ready shadow-compatible checkpoint', () => {
  const state = buildInitialCaControllerState({ productionCount: 0, sourceCount: 0, mainSha: 'a'.repeat(40), now: '2026-09-13T15:00:00.000Z' });
  assert.equal(state.controller_kind, 'ca');
  assert.equal(state.status, 'ready_discovery');
  assert.equal(state.query_offset, 0);
  assert.equal(state.query_limit, 4);
  assert.equal(state.plan_size, 104);
  assert.equal(state.production_count, 0);
  assert.equal(state.source_count, 0);
  assert.deepEqual(caControllerDecision(state), { action: 'start_discovery', query_offset: 0, query_limit: 4, cycle: 0 });
  assert.equal(validateControllerStateText(`${JSON.stringify(state)}\n`).controller_kind, 'ca');
});

test('Canada controller cutover is explicit and false by default', () => {
  assert.equal(globalCaControllerCutoverEnabled({}), false);
  assert.equal(globalCaControllerCutoverEnabled({ GLOBAL_CA_CONTROLLER_CUTOVER_ENABLED: 'false' }), false);
  assert.equal(globalCaControllerCutoverEnabled({ GLOBAL_CA_CONTROLLER_CUTOVER_ENABLED: 'true' }), true);
});

test('Canada controller state codec rejects UK plan size and invalid offsets', () => {
  const wrongPlan = buildInitialCaControllerState();
  wrongPlan.plan_size = 96;
  assert.throws(() => validateControllerStateText(JSON.stringify(wrongPlan)), /plan_size must be 104/);
  const wrongOffset = buildInitialCaControllerState();
  wrongOffset.query_offset = 104;
  assert.throws(() => validateControllerStateText(JSON.stringify(wrongOffset)), /query_offset is invalid/);
});

test('Canada controller exposes reserved discovery and active workflow decisions without duplicating work', () => {
  const reserved = buildInitialCaControllerState();
  reserved.cloud_controller_intent = {
    phase: 'reserved',
    action: 'start_discovery',
    workflow_id: 'cactl-v1-discover-q0-l4'
  };
  assert.deepEqual(caControllerDecision(reserved), {
    action: 'bind_reserved_discovery',
    workflow_id: 'cactl-v1-discover-q0-l4'
  });

  const active = buildInitialCaControllerState();
  active.status = 'running_discovery';
  active.active_instance = { id: 'cactl-v2-discover-q0-l4', mode: 'discovery' };
  assert.deepEqual(caControllerDecision(active), {
    action: 'inspect_active_workflow',
    workflow_id: 'cactl-v2-discover-q0-l4',
    mode: 'discovery'
  });
});

test('Canada controller exposes source PR review but keeps acquisition explicitly unarmed', () => {
  const review = buildInitialCaControllerState();
  review.status = 'reviewing_source_pr';
  review.pending_source_pr = { pr_number: 1727, workflow_id: 'cactl-v3-discover-q0-l4' };
  assert.deepEqual(caControllerDecision(review), { action: 'review_source_pr', pr_number: 1727 });

  const acquisition = buildInitialCaControllerState();
  acquisition.status = 'ready_acquisition';
  assert.deepEqual(caControllerDecision(acquisition), { action: 'start_acquisition', cycle: 0 });
});
