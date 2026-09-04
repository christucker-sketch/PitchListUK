import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isTransientWorkflowDescribeError,
  workflowDescribeBackoffMilliseconds
} from '../../cloudflare-texas-acquisition/scripts/growth-controller.mjs';

test('Cloudflare Workflow internal-server 10001 is classified as transient', () => {
  assert.equal(isTransientWorkflowDescribeError(new Error('workflows.api.error.internal_server code: 10001')), true);
});

test('Cloudflare API authentication error 10000 is classified as transient', () => {
  assert.equal(isTransientWorkflowDescribeError(new Error('Authentication error code: 10000')), true);
});

test('common transient network failures are retryable but terminal Workflow states are not', () => {
  assert.equal(isTransientWorkflowDescribeError(new Error('fetch failed: ECONNRESET')), true);
  assert.equal(isTransientWorkflowDescribeError(new Error('socket hang up')), true);
  assert.equal(isTransientWorkflowDescribeError(new Error('Workflow cf_test is errored')), false);
  assert.equal(isTransientWorkflowDescribeError(new Error('permission denied')), false);
});

test('Workflow describe retry backoff is exponential and capped', () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6].map(attempt => workflowDescribeBackoffMilliseconds(attempt)),
    [5000, 10000, 20000, 40000, 60000, 60000]
  );
  assert.equal(workflowDescribeBackoffMilliseconds(3, { baseMs: 1000, maximumMs: 2500 }), 2500);
});
