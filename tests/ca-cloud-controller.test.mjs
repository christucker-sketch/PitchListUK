import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildInitialCaControllerState,
  caActiveWorkflowIsStale,
  caControllerDecision,
  globalCaControllerCutoverEnabled,
  recoverCaActiveWorkflowState,
  CA_ACTIVE_WORKFLOW_STALE_MS
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

test('Canada stale workflow recovery preserves counts and retries the same checkpoint', () => {
  const state = buildInitialCaControllerState({ productionCount: 3, sourceCount: 5, mainSha: 'a'.repeat(40), now: '2026-09-14T12:00:00.000Z' });
  state.status = 'running_discovery';
  state.query_offset = 40;
  state.cycle = 2;
  state.totals.discovery_runs = 20;
  state.totals.acquisition_runs = 19;
  const active = {
    id: 'cactl-v77-discover-q40-l4',
    mode: 'discovery',
    query_offset: 40,
    query_limit: 4,
    started_at: '2026-09-14T12:00:00.000Z'
  };
  state.active_instance = active;
  assert.equal(caActiveWorkflowIsStale(active, { now: Date.parse('2026-09-14T12:29:59.999Z') }), false);
  assert.equal(caActiveWorkflowIsStale(active, { now: Date.parse('2026-09-14T12:30:00.000Z') }), true);
  assert.equal(CA_ACTIVE_WORKFLOW_STALE_MS, 30 * 60 * 1000);

  const recovered = recoverCaActiveWorkflowState(state, active, { reason: 'stale_running', now: '2026-09-18T06:00:00.000Z' });
  assert.equal(recovered.status, 'ready_discovery');
  assert.equal(recovered.active_instance, null);
  assert.equal(recovered.query_offset, 40);
  assert.equal(recovered.cycle, 2);
  assert.equal(recovered.production_count, 3);
  assert.equal(recovered.source_count, 5);
  assert.deepEqual(recovered.totals, state.totals);
  assert.equal(recovered.results.at(-1).workflow_id, active.id);
  assert.equal(recovered.results.at(-1).recovery_reason, 'stale_running');
});

test('Canada stale acquisition recovery returns to acquisition without inventing additions', () => {
  const state = buildInitialCaControllerState({ productionCount: 3, sourceCount: 5 });
  state.status = 'running_acquisition';
  state.totals.opportunity_additions = 3;
  const active = { id: 'cactl-v80-acquire-c2', mode: 'acquisition', started_at: '2026-09-18T04:00:00.000Z' };
  state.active_instance = active;
  const recovered = recoverCaActiveWorkflowState(state, active, { reason: 'terminal_errored:test', now: '2026-09-18T06:00:00.000Z' });
  assert.equal(recovered.status, 'ready_acquisition');
  assert.equal(recovered.active_instance, null);
  assert.equal(recovered.totals.opportunity_additions, 3);
});

test('Canada controller drives source PR review through reserved merge and deploy verification', () => {
  const review = buildInitialCaControllerState();
  review.status = 'reviewing_source_pr';
  review.pending_source_pr = { pr_number: 1728, workflow_id: 'cactl-v3-discover-q0-l4' };
  assert.deepEqual(caControllerDecision(review), { action: 'review_source_pr', pr_number: 1728 });

  const reservedMerge = buildInitialCaControllerState();
  reservedMerge.cloud_controller_intent = { phase: 'reserved', action: 'merge_source_pr', pr_number: 1728 };
  assert.deepEqual(caControllerDecision(reservedMerge), { action: 'merge_reserved_source_pr', pr_number: 1728 });

  const deploy = buildInitialCaControllerState();
  deploy.status = 'waiting_source_deploy';
  deploy.pending_deployment = { kind: 'source', merge_sha: 'b'.repeat(40) };
  assert.deepEqual(caControllerDecision(deploy), { action: 'verify_source_deploy', merge_sha: 'b'.repeat(40) });
});

test('Canada controller reserves and binds opportunity acquisition without duplicating work', () => {
  const acquisition = buildInitialCaControllerState();
  acquisition.status = 'ready_acquisition';
  acquisition.cycle = 3;
  assert.deepEqual(caControllerDecision(acquisition), { action: 'start_acquisition', cycle: 3 });

  const reserved = buildInitialCaControllerState();
  reserved.status = 'ready_acquisition';
  reserved.cloud_controller_intent = {
    phase: 'reserved',
    action: 'start_acquisition',
    workflow_id: 'cactl-v12-acquire-c3'
  };
  assert.deepEqual(caControllerDecision(reserved), {
    action: 'bind_reserved_acquisition',
    workflow_id: 'cactl-v12-acquire-c3'
  });

  const active = buildInitialCaControllerState();
  active.status = 'running_acquisition';
  active.active_instance = { id: 'cactl-v13-acquire-c3', mode: 'acquisition' };
  assert.deepEqual(caControllerDecision(active), {
    action: 'inspect_active_workflow',
    workflow_id: 'cactl-v13-acquire-c3',
    mode: 'acquisition'
  });
});

test('Canada controller drives data PR review through exact merge and frontend deployment', () => {
  const review = buildInitialCaControllerState();
  review.status = 'reviewing_data_pr';
  review.pending_data_pr = { pr_number: 1900, workflow_id: 'cactl-v14-acquire-c3' };
  assert.deepEqual(caControllerDecision(review), { action: 'review_data_pr', pr_number: 1900 });

  const reservedMerge = buildInitialCaControllerState();
  reservedMerge.cloud_controller_intent = { phase: 'reserved', action: 'merge_data_pr', pr_number: 1900 };
  assert.deepEqual(caControllerDecision(reservedMerge), { action: 'merge_reserved_data_pr', pr_number: 1900 });

  const deploy = buildInitialCaControllerState();
  deploy.status = 'waiting_frontend_deploy';
  deploy.pending_deployment = { kind: 'data', merge_sha: 'c'.repeat(40) };
  assert.deepEqual(caControllerDecision(deploy), { action: 'verify_frontend_deploy', merge_sha: 'c'.repeat(40) });
});
