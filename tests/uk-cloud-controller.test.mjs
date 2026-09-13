import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildInitialUkControllerState,
  globalUkControllerCutoverEnabled,
  ukControllerDecision
} from '../operations/cloudflare-global-acquisition/lib/uk-cloud-controller.mjs';
import { validateControllerStateText } from '../operations/cloudflare-global-acquisition/lib/controller-state-codec.mjs';

test('UK controller starts in discovery-ready shadow-compatible state', () => {
  const state = buildInitialUkControllerState({ productionCount: 289, sourceCount: 64, mainSha: 'a'.repeat(40), now: '2026-09-13T12:00:00.000Z' });
  assert.equal(state.controller_kind, 'uk');
  assert.equal(state.status, 'ready_discovery');
  assert.equal(state.query_offset, 0);
  assert.equal(state.query_limit, 4);
  assert.equal(state.plan_size, 96);
  assert.equal(state.production_count, 289);
  assert.equal(state.source_count, 64);
  assert.equal(ukControllerDecision(state).action, 'start_discovery');
  assert.equal(validateControllerStateText(`${JSON.stringify(state)}\n`).controller_kind, 'uk');
});

test('UK controller decisions preserve reserved two-phase execution', () => {
  const state = buildInitialUkControllerState();
  state.cloud_controller_intent = {
    phase: 'reserved',
    action: 'start_discovery',
    workflow_id: 'ukctl-v1-discover-q0-l4'
  };
  assert.deepEqual(ukControllerDecision(state), {
    action: 'bind_reserved_discovery',
    workflow_id: 'ukctl-v1-discover-q0-l4'
  });
  state.cloud_controller_intent = null;
  state.status = 'running_discovery';
  state.active_instance = { id: 'ukctl-v1-discover-q0-l4', mode: 'discovery' };
  assert.deepEqual(ukControllerDecision(state), {
    action: 'inspect_active_workflow',
    workflow_id: 'ukctl-v1-discover-q0-l4',
    mode: 'discovery'
  });
});

test('UK controller moves through PR and deployment gates', () => {
  const state = buildInitialUkControllerState();
  state.status = 'reviewing_source_pr';
  state.pending_source_pr = { pr_number: 123 };
  assert.equal(ukControllerDecision(state).action, 'review_source_pr');
  state.status = 'waiting_source_deploy';
  state.pending_deployment = { merge_sha: 'b'.repeat(40) };
  assert.equal(ukControllerDecision(state).action, 'verify_source_deploy');
  state.status = 'ready_acquisition';
  state.pending_deployment = null;
  assert.equal(ukControllerDecision(state).action, 'start_acquisition');
  state.status = 'reviewing_data_pr';
  state.pending_data_pr = { pr_number: 456 };
  assert.equal(ukControllerDecision(state).action, 'review_data_pr');
  state.status = 'waiting_frontend_deploy';
  state.pending_deployment = { merge_sha: 'c'.repeat(40) };
  assert.equal(ukControllerDecision(state).action, 'verify_frontend_deploy');
});

test('UK cutover flag is explicit and fail-closed', () => {
  assert.equal(globalUkControllerCutoverEnabled({}), false);
  assert.equal(globalUkControllerCutoverEnabled({ GLOBAL_UK_CONTROLLER_CUTOVER_ENABLED: 'false' }), false);
  assert.equal(globalUkControllerCutoverEnabled({ GLOBAL_UK_CONTROLLER_CUTOVER_ENABLED: 'true' }), true);
});
