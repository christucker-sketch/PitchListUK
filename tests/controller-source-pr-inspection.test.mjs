import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSourcePrInspection } from '../operations/cloudflare-global-acquisition/lib/controller-github-client.mjs';

const head = 'a'.repeat(40);
const base = 'b'.repeat(40);

function state() {
  return {
    status: 'reviewing_source_pr',
    current: { source_pr: 123, state_code: 'TX', discovery_instance_id: 'cf_demo' },
    results: [{
      instance_id: 'cf_demo',
      state_name: 'Texas',
      state_code: 'TX',
      generated_source_count: 2,
      evidence_passed_count: 2,
      publication: { source_count: 2, source_ids: ['src_b','src_a'] }
    }]
  };
}

function pr() {
  return {
    number: 123,
    state: 'OPEN', merged: false, draft: false,
    base_ref: 'main', head_ref: 'sources/cloud-us-growth-tx-demo',
    base_sha: base, head_sha: head,
    commits: [{ sha: head, parents: [base] }],
    files: [{ path: 'operations/opportunity-pipeline/config/us-growth-source-registry.json' }],
    check_runs: [{ status: 'completed', conclusion: 'success' }],
    source_registry_proof: {
      additions_only: true,
      base_count: 100,
      head_count: 102,
      added_count: 2,
      added_ids: ['src_b','src_a']
    },
    body: [
      '- state: Texas (TX)',
      '- net-new approved sources: 2',
      '- deterministic source evidence receipts: 2/2 passed',
      '- additions only; no source removals',
      '- no automatic merge or deploy requested',
      '  - src_a: receipt',
      '  - src_b: receipt'
    ].join('\n')
  };
}

test('source PR inspection accepts exact one-commit one-file evidence-complete candidate', () => {
  const result = validateSourcePrInspection(state(), pr());
  assert.deepEqual(result.source_ids, ['src_a','src_b']);
  assert.equal(result.head_sha, head);
  assert.equal(result.registry_base_count, 100);
  assert.equal(result.registry_head_count, 102);
});

test('source PR inspection fails closed when branch, parent, file scope or CI is wrong', () => {
  for (const mutate of [
    p => { p.head_ref = 'data/cloud-us-bad'; },
    p => { p.commits[0].parents = ['c'.repeat(40)]; },
    p => { p.files.push({ path: 'README.md' }); },
    p => { p.check_runs[0].conclusion = 'failure'; }
  ]) {
    const candidate = pr(); mutate(candidate);
    assert.throws(() => validateSourcePrInspection(state(), candidate));
  }
});

test('source PR inspection requires every checkpointed evidence receipt', () => {
  const candidate = pr();
  candidate.body = candidate.body.replace('  - src_b: receipt', '');
  assert.throws(() => validateSourcePrInspection(state(), candidate), /missing_evidence_receipt/);
});

test('source PR inspection rejects missing, extra or substituted registry additions', () => {
  for (const addedIds of [[], ['src_a'], ['src_a','src_b','src_c'], ['src_a','src_c']]) {
    const candidate = pr();
    candidate.source_registry_proof.added_ids = addedIds;
    candidate.source_registry_proof.added_count = addedIds.length;
    candidate.source_registry_proof.head_count = 100 + addedIds.length;
    assert.throws(() => validateSourcePrInspection(state(), candidate));
  }
});
