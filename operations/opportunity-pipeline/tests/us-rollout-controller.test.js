import test from 'node:test';
import assert from 'node:assert/strict';

import {
  advanceAfterResult,
  compactStatus,
  ciRollupState,
  initialState,
  parseCompactWorkflowOutput,
  parseInstanceId,
  parseWorkflowStatus,
  repositoryHeadAcceptable,
  validateAutoMergeCandidate,
  retryClosedReviewState,
  retryFailedWorkflowState
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

test('closed unmerged review can be checkpointed and safely rerun at the same batch', () => {
  const pending = advanceAfterResult(initialState({ nextState: 'GA', snapshotCount: 120 }), {
    state_code: 'GA', state_name: 'Georgia', batch_number: 1, batch_count: 1,
    before: 120, after: 128, additions: 8, publication: { pr_number: 114 }
  });
  const ready = retryClosedReviewState(pending, {
    prState: 'CLOSED', snapshotCount: 120, reason: 'live_application_year_mismatch'
  });
  assert.equal(ready.status, 'ready');
  assert.equal(ready.next_state, 'GA');
  assert.equal(ready.next_batch, 1);
  assert.equal(ready.results.at(-1).discarded.reason, 'live_application_year_mismatch');
  assert.throws(() => retryClosedReviewState(pending, { prState: 'MERGED', snapshotCount: 128, reason: 'bad' }), /not closed unmerged/);
});

test('terminated or errored Workflow can be checkpointed and safely rerun at the same state', () => {
  const running = initialState({ nextState: 'WI', snapshotCount: 166 });
  running.status = 'running';
  running.active_instance = { id: `cf_${'d'.repeat(64)}`, state_name: 'Wisconsin', batch_count: 1 };
  const ready = retryFailedWorkflowState(running, {
    workflowStatus: 'terminated',
    reason: 'zero_addition_promotion_retry_loop'
  });
  assert.equal(ready.status, 'ready');
  assert.equal(ready.next_state, 'WI');
  assert.equal(ready.active_instance, null);
  assert.equal(ready.failed_instances.at(-1).reason, 'zero_addition_promotion_retry_loop');
  assert.throws(() => retryFailedWorkflowState(running, { workflowStatus: 'running', reason: 'bad' }), /only failed instances/);
});

test('auto-merge accepts only an exact-head snapshot PR with successful verify CI and complete evidence', () => {
  const baseSha = 'a'.repeat(40);
  const headOid = 'b'.repeat(40);
  const result = {
    state_code: 'IL', state_name: 'Illinois', before: 105, after: 112, additions: 7,
    staged_count: 7, evidence_passed_count: 7,
    publication: {
      pr_number: 110,
      branch: `data/cloud-illinois-growth-1234567890abcdef-base-${baseSha.slice(0, 16)}`
    }
  };
  const pr = {
    number: 110, state: 'OPEN', isDraft: false, baseRefName: 'main', baseRefOid: baseSha,
    headRefName: result.publication.branch, headRefOid: headOid, mergeable: 'MERGEABLE',
    commits: [{ oid: headOid }], files: [{ path: 'functions/_data/us-opportunities.mjs', additions: 10, deletions: 3 }],
    statusCheckRollup: [{ __typename: 'CheckRun', name: 'verify', status: 'COMPLETED', conclusion: 'SUCCESS' }],
    body: [
      '- state: Illinois (IL)',
      '- production snapshot: 105 -> 112',
      '- net-new additions: 7',
      '- deterministic evidence receipts: 7/7 passed',
      '- no automatic merge or deploy requested'
    ].join('\n')
  };
  assert.equal(ciRollupState(pr.statusCheckRollup), 'passed');
  assert.equal(validateAutoMergeCandidate(pr, result, { baseSha, snapshotPath: 'functions/_data/us-opportunities.mjs' }), headOid);
  assert.throws(() => validateAutoMergeCandidate({ ...pr, headRefOid: 'c'.repeat(40) }, result, { baseSha, snapshotPath: 'functions/_data/us-opportunities.mjs' }), /one exact reviewed head/);
  assert.throws(() => validateAutoMergeCandidate({ ...pr, files: [{ path: 'README.md' }] }, result, { baseSha, snapshotPath: 'functions/_data/us-opportunities.mjs' }), /outside the production snapshot/);
  assert.throws(() => validateAutoMergeCandidate(pr, { ...result, evidence_passed_count: 6 }, { baseSha, snapshotPath: 'functions/_data/us-opportunities.mjs' }), /complete deterministic evidence/);
});

test('CI rollup fails closed on missing verify, failure or unknown check types', () => {
  assert.equal(ciRollupState([]), 'pending');
  assert.equal(ciRollupState([{ __typename: 'CheckRun', name: 'verify', status: 'IN_PROGRESS', conclusion: '' }]), 'pending');
  assert.equal(ciRollupState([{ __typename: 'CheckRun', name: 'verify', status: 'COMPLETED', conclusion: 'FAILURE' }]), 'failed');
  assert.equal(ciRollupState([{ __typename: 'CheckRun', name: 'verify', status: 'COMPLETED', conclusion: 'SKIPPED' }]), 'failed');
  assert.equal(ciRollupState([{ __typename: 'CheckRun', name: 'lint', status: 'COMPLETED', conclusion: 'SUCCESS' }]), 'failed');
  assert.equal(ciRollupState([{ __typename: 'Unexpected' }]), 'failed');
});

test('CI rollup permits skipped non-required jobs only when verify passes', () => {
  const verify = { __typename: 'CheckRun', name: 'verify', status: 'COMPLETED', conclusion: 'SUCCESS' };
  const skippedFrontend = { __typename: 'CheckRun', name: 'frontend_changes', status: 'COMPLETED', conclusion: 'SKIPPED' };
  const skippedDeploy = { __typename: 'CheckRun', name: 'deploy_frontend', status: 'COMPLETED', conclusion: 'SKIPPED' };
  assert.equal(ciRollupState([verify, skippedFrontend, skippedDeploy]), 'passed');
  assert.equal(ciRollupState([verify, { ...skippedFrontend, conclusion: 'FAILURE' }]), 'failed');
});
