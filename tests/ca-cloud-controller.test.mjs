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

test('Canada controller keeps future PR/deployment statuses non-mutating until implementation is armed', () => {
  const state = buildInitialCaControllerState();
  state.status = 'reviewing_source_pr';
  assert.deepEqual(caControllerDecision(state), { action: 'await_implementation', status: 'reviewing_source_pr' });
});
