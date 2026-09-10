import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAcquisitionWorkflowCompletion } from '../operations/cloudflare-global-acquisition/lib/controller-acquisition-completion.mjs';

function baseState() {
  return {
    status: 'running_cloudflare_acquisition',
    snapshot_count: 704,
    acquisition_batch: 2,
    current: { state_code: 'TX', source_pr: 1700 },
    active_instance: { id: 'cf_acquire', mode: 'acquire', state_code: 'TX', worker_version: 'wv', worker_sha: 'a'.repeat(40) },
    results: []
  };
}

test('positive acquisition completion checkpoints data PR review exactly', () => {
  const result = applyAcquisitionWorkflowCompletion(baseState(), baseState().active_instance, {
    state_code: 'TX', before: 704, additions: 3, after: 707, publication: { pr_number: 1800 }
  });
  assert.equal(result.next_status, 'reviewing_data_pr');
  assert.equal(result.data_pr, 1800);
  assert.equal(result.next_state.active_instance, null);
  assert.equal(result.next_state.current.acquisition_instance_id, 'cf_acquire');
  assert.equal(result.next_state.current.data_pr, 1800);
  assert.equal(result.next_state.acquisition_batch, 2);
  assert.equal(result.next_state.results.length, 1);
  assert.equal(result.next_state.results[0].instance_id, 'cf_acquire');
});

test('zero-addition acquisition completion advances only the batch', () => {
  const result = applyAcquisitionWorkflowCompletion(baseState(), baseState().active_instance, {
    state_code: 'TX', before: 704, additions: 0, after: 704, publication: {}
  });
  assert.equal(result.next_status, 'ready_acquisition');
  assert.equal(result.next_batch, 3);
  assert.equal(result.next_state.current.acquisition_instance_id, 'cf_acquire');
  assert.equal(result.next_state.current.data_pr, undefined);
  assert.equal(result.next_state.active_instance, null);
});

test('acquisition completion fails closed on snapshot drift or invalid count delta', () => {
  assert.throws(() => applyAcquisitionWorkflowCompletion(baseState(), baseState().active_instance, {
    state_code: 'TX', before: 703, additions: 1, after: 704, publication: { pr_number: 1800 }
  }), /acquisition_snapshot_drift/);
  assert.throws(() => applyAcquisitionWorkflowCompletion(baseState(), baseState().active_instance, {
    state_code: 'TX', before: 704, additions: 2, after: 705, publication: { pr_number: 1800 }
  }), /count_delta_invalid/);
});

test('positive acquisition completion requires an exact data PR number', () => {
  assert.throws(() => applyAcquisitionWorkflowCompletion(baseState(), baseState().active_instance, {
    state_code: 'TX', before: 704, additions: 1, after: 705, publication: {}
  }), /data_pr_invalid/);
});

test('replaying completion for an already checkpointed workflow does not duplicate the result', () => {
  const state = baseState();
  state.results.push({ state_code: 'TX', before: 704, additions: 0, after: 704, instance_id: 'cf_acquire', worker_version: 'wv', worker_sha: 'a'.repeat(40) });
  const result = applyAcquisitionWorkflowCompletion(state, state.active_instance, {
    state_code: 'TX', before: 704, additions: 0, after: 704, publication: {}
  });
  assert.equal(result.next_state.results.length, 1);
});
