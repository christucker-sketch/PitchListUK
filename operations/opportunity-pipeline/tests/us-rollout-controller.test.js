import test from 'node:test';
import assert from 'node:assert/strict';

import {
  advanceAfterResult,
  compactStatus,
  initialState,
  parseCompactWorkflowOutput,
  parseInstanceId,
  parseWorkflowStatus,
  repositoryHeadAcceptable
} from '../../cloudflare-texas-acquisition/scripts/rollout-controller.mjs';

test('controller parses only compact Workflow output instead of exposing snapshots', () => {
  const result = { state_code: 'IL', state_name: 'Illinois', batch_number: 1, batch_count: 1, before: 105, after: 105, additions: 0, publication: { created: false } };
  const output = `Status: ✅ Completed\nName:      emit compact Illinois rollout result\nOutput:    ${JSON.stringify(JSON.stringify(result))}\n`;
  assert.equal(parseWorkflowStatus(output), 'complete');
  assert.deepEqual(parseCompactWorkflowOutput(output, 'Illinois'), result);
  assert.ok(!JSON.stringify(parseCompactWorkflowOutput(output, 'Illinois')).includes('rows'));
});

test('controller parses a Workflow instance id and fails when it is absent', () => {
  const id = `cf_${'a'.repeat(64)}`;
  assert.equal(parseInstanceId(`Workflow instance created: ${id}`), id);
  assert.throws(() => parseInstanceId('created'), /did not return/);
});

test('zero-addition result advances to the next state and remains ready', () => {
  const state = initialState({ nextState: 'IL', snapshotCount: 105 });
  const next = advanceAfterResult(state, {
    state_code: 'IL', state_name: 'Illinois', batch_number: 1, batch_count: 1,
    before: 105, after: 105, additions: 0, publication: { created: false }
  });
  assert.equal(next.status, 'ready');
  assert.equal(next.next_state, 'OH');
  assert.ok(next.completed_states.includes('IL'));
  assert.equal(compactStatus(next).processed, 6);
});

test('addition result stops at review and does not advance the state', () => {
  const state = initialState({ nextState: 'IL', snapshotCount: 105 });
  const next = advanceAfterResult(state, {
    state_code: 'IL', state_name: 'Illinois', batch_number: 1, batch_count: 1,
    before: 105, after: 112, additions: 7, instance_id: `cf_${'b'.repeat(64)}`,
    publication: { created: true, pr_number: 110 }
  });
  assert.equal(next.status, 'awaiting_review');
  assert.equal(next.next_state, 'IL');
  assert.equal(next.pending_review.pr_number, 110);
  assert.ok(!next.completed_states.includes('IL'));
});

test('controller fails closed on snapshot or batch drift', () => {
  const state = initialState({ nextState: 'IL', snapshotCount: 105 });
  assert.throws(() => advanceAfterResult(state, { state_code: 'IL', batch_number: 1, before: 104, additions: 0 }), /Snapshot drift/);
  assert.throws(() => advanceAfterResult(state, { state_code: 'OH', batch_number: 1, before: 105, additions: 0 }), /does not match/);
});

test('compact status preserves resumable active Workflow metadata', () => {
  const state = initialState({ nextState: 'IL', snapshotCount: 105 });
  state.status = 'running';
  state.active_instance = { id: `cf_${'c'.repeat(64)}`, state_name: 'Illinois', batch_count: 1 };
  assert.deepEqual(compactStatus(state).active_instance, state.active_instance);
});

test('repository preflight permits only an ancestor main while reconciling a merged review', () => {
  const local = 'a'.repeat(40);
  const remote = 'b'.repeat(40);
  assert.equal(repositoryHeadAcceptable(local, local, local), true);
  assert.equal(repositoryHeadAcceptable(local, remote, local, false), false);
  assert.equal(repositoryHeadAcceptable(local, remote, local, true), true);
  assert.equal(repositoryHeadAcceptable(local, remote, 'c'.repeat(40), true), false);
});
