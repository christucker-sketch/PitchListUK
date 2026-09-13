import assert from 'node:assert/strict';
import test from 'node:test';

import { validateCaSourcePr } from '../operations/cloudflare-global-acquisition/lib/ca-controller-github-client.mjs';

function result() {
  return {
    source_additions: 1,
    source_ids: ['ca-on-aaaaaaaaaaaa'],
    source_pr: {
      pr_number: 1800,
      branch: 'sources/cloud-ca-growth-1234567890abcdef-base-1234567890abcdef',
      additions: 1
    }
  };
}

function pr(overrides = {}) {
  return {
    number: 1800,
    state: 'OPEN',
    merged: false,
    draft: false,
    base_ref: 'main',
    base_sha: '1'.repeat(40),
    head_ref: 'sources/cloud-ca-growth-1234567890abcdef-base-1234567890abcdef',
    head_sha: '2'.repeat(40),
    files: ['operations/opportunity-pipeline/config/ca-approved-source-routes.json'],
    body: [
      '- net-new approved sources: 1',
      '- deterministic source evidence receipts: 1/1 passed',
      '  - ca-on-aaaaaaaaaaaa: https://www.ontario.ca/vendors; region=ON',
      '- additions only; no source removals',
      '- no automatic merge or deploy requested'
    ].join('\n'),
    check_runs: [{ id: 1, name: 'verify', status: 'completed', conclusion: 'success' }],
    ...overrides
  };
}

test('Canada source PR validation accepts exact additions-only evidence after CI succeeds', () => {
  const validated = validateCaSourcePr(result(), pr());
  assert.equal(validated.ready, true);
  assert.equal(validated.pr_number, 1800);
  assert.equal(validated.additions, 1);
  assert.deepEqual(validated.source_ids, ['ca-on-aaaaaaaaaaaa']);
});

test('Canada source PR validation waits while checks are incomplete', () => {
  const validated = validateCaSourcePr(result(), pr({
    check_runs: [{ id: 1, name: 'verify', status: 'in_progress', conclusion: null }]
  }));
  assert.equal(validated.ready, false);
});

test('Canada source PR validation rejects wider file scope, substituted IDs and missing receipts', () => {
  assert.throws(() => validateCaSourcePr(result(), pr({
    files: ['operations/opportunity-pipeline/config/ca-approved-source-routes.json', 'functions/_data/ca-opportunities.mjs']
  })), /file_scope/);

  const substituted = result();
  substituted.source_ids = ['ca-on-bbbbbbbbbbbb'];
  assert.throws(() => validateCaSourcePr(substituted, pr()), /receipt_missing/);

  assert.throws(() => validateCaSourcePr(result(), pr({ body: '- net-new approved sources: 1' })), /body_evidence/);
});

test('Canada source PR validation rejects wrong branch, PR number or zero additions', () => {
  assert.throws(() => validateCaSourcePr(result(), pr({ head_ref: 'sources/cloud-us-ontario-growth' })), /head_invalid|branch_mismatch/);
  assert.throws(() => validateCaSourcePr(result(), pr({ number: 1801 })), /number_mismatch/);
  const zero = result();
  zero.source_additions = 0;
  zero.source_ids = [];
  assert.throws(() => validateCaSourcePr(zero, pr()), /additions_invalid/);
});
