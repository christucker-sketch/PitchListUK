import assert from 'node:assert/strict';
import test from 'node:test';

import { canadaSourceDiscoveryWorkflowLimits } from '../operations/cloudflare-global-acquisition/lib/ca-source-discovery-workflow.mjs';
import {
  CA_ADDITION_LIMITS,
  canadaAdditionWorkflowLimits
} from '../operations/cloudflare-global-acquisition/lib/ca-additions-workflow.mjs';

test('Canada controller discovery uses the full existing safe depth envelope', () => {
  const limits = canadaSourceDiscoveryWorkflowLimits({
    trigger: 'ca-cloud-controller',
    query_limit: 4,
    results_per_query: 5,
    candidate_limit: 24,
    timeout_ms: 12000
  });
  assert.deepEqual(limits, {
    query_limit: 4,
    results_per_query: 8,
    candidate_limit: 32,
    timeout_ms: 12000
  });
});

test('Canada non-controller discovery remains explicitly bounded by caller settings', () => {
  assert.deepEqual(canadaSourceDiscoveryWorkflowLimits({
    query_limit: 99,
    results_per_query: 6,
    candidate_limit: 27,
    timeout_ms: 50000
  }), {
    query_limit: 12,
    results_per_query: 6,
    candidate_limit: 27,
    timeout_ms: 30000
  });
});

test('Canada controller acquisition uses the full existing safe polling envelope', () => {
  const limits = canadaAdditionWorkflowLimits({
    trigger: 'ca-cloud-controller',
    concurrency: 3,
    timeout_ms: 12000,
    max_additions: 10
  });
  assert.deepEqual(limits, {
    concurrency: 4,
    timeout_ms: 12000,
    max_additions: 25
  });
  assert.equal(CA_ADDITION_LIMITS.maximum_concurrency, 4);
  assert.equal(CA_ADDITION_LIMITS.maximum_additions, 25);
});

test('Canada non-controller acquisition remains explicitly bounded by caller settings', () => {
  assert.deepEqual(canadaAdditionWorkflowLimits({
    concurrency: 2,
    timeout_ms: 9000,
    max_additions: 7
  }), {
    concurrency: 2,
    timeout_ms: 9000,
    max_additions: 7
  });
});
