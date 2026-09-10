import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDataPrInspection } from '../operations/cloudflare-global-acquisition/lib/controller-github-client.mjs';

const baseSha = 'b'.repeat(40);
const headSha = 'a'.repeat(40);
const promotionSha = 'd'.repeat(64);
const branch = `data/cloud-texas-growth-${promotionSha.slice(0, 16)}-base-${baseSha.slice(0, 16)}`;

function state() {
  return {
    status: 'reviewing_data_pr', snapshot_count: 704,
    current: { mode: 'acquire', state_code: 'TX', acquisition_instance_id: 'cf_acq', data_pr: 1701 },
    results: [{
      instance_id: 'cf_acq', state_name: 'Texas', state_code: 'TX',
      staged_count: 2, evidence_passed_count: 2,
      before: 704, after: 706, additions: 2,
      promotion_rows_sha256: promotionSha,
      publication: { pr_number: 1701, branch }
    }]
  };
}

function pr() {
  return {
    number: 1701, state: 'OPEN', merged: false, draft: false,
    base_ref: 'main', base_sha: baseSha, head_ref: branch, head_sha: headSha,
    commits: [{ sha: headSha, parents: [baseSha] }],
    files: [{ path: 'functions/_data/us-opportunities.mjs' }],
    check_runs: [{ status: 'completed', conclusion: 'success' }],
    data_snapshot_proof: {
      additions_only: true, base_count: 704, head_count: 706,
      added_count: 2, added_ids: ['opp_b', 'opp_a']
    },
    body: [
      '- state: Texas (TX)',
      '- production snapshot: 704 -> 706',
      '- net-new additions: 2',
      `- promotion rows SHA256: ${promotionSha}`,
      '- deterministic evidence receipts: 2/2 passed',
      '- no automatic merge or deploy requested'
    ].join('\n')
  };
}

test('data PR inspection binds exact checkpointed Workflow result to compact snapshot delta proof', () => {
  assert.deepEqual(validateDataPrInspection(state(), pr()), {
    pr_number: 1701,
    head_sha: headSha,
    base_sha: baseSha,
    state_code: 'TX',
    before: 704,
    after: 706,
    additions: 2,
    opportunity_ids: ['opp_a', 'opp_b']
  });
});

test('data PR inspection fails closed when snapshot proof counts differ from checkpointed Workflow result', () => {
  const candidate = pr();
  candidate.data_snapshot_proof.head_count = 707;
  assert.throws(() => validateDataPrInspection(state(), candidate), /data_pr_snapshot_count_mismatch/);
});

test('data PR inspection fails closed when publication branch does not match the exact Workflow result', () => {
  const checkpoint = state();
  checkpoint.results[0].publication.branch = `data/cloud-texas-growth-${'e'.repeat(16)}-base-${baseSha.slice(0, 16)}`;
  assert.throws(() => validateDataPrInspection(checkpoint, pr()), /data_pr_result_branch_mismatch/);
});

test('data PR inspection fails closed when promotion provenance differs from the Workflow checkpoint', () => {
  const checkpoint = state();
  checkpoint.results[0].promotion_rows_sha256 = 'e'.repeat(64);
  assert.throws(() => validateDataPrInspection(checkpoint, pr()), /data_pr_branch_provenance_mismatch/);
});
