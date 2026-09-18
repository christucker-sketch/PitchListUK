import assert from 'node:assert/strict';
import test from 'node:test';

import {
  UK_HOMEPAGE_PATH,
  UK_SNAPSHOT_PATH,
  UK_SOURCE_REGISTRY_PATH,
  validateUkDataPr,
  validateUkSourcePr
} from '../operations/cloudflare-global-acquisition/lib/uk-controller-github-client.mjs';

function successfulChecks() {
  return [{ id: 1, name: 'verify', status: 'completed', conclusion: 'success' }];
}

test('valid UK source PR is accepted only after checks pass', () => {
  const result = {
    source_additions: 2,
    source_pr: { pr_number: 12, branch: 'sources/cloud-uk-growth-0123456789abcdef-base-0123456789abcdef', additions: 2 }
  };
  const pr = {
    number: 12,
    state: 'OPEN', merged: false, draft: false,
    base_ref: 'main', base_sha: 'a'.repeat(40), head_sha: 'b'.repeat(40),
    head_ref: result.source_pr.branch,
    files: [UK_SOURCE_REGISTRY_PATH],
    check_runs: successfulChecks(),
    body: '- net-new public-service sources: 2\n- source removals: forbidden\n- automatic merge: disabled'
  };
  const validated = validateUkSourcePr(result, pr);
  assert.equal(validated.ready, true);
  assert.equal(validated.additions, 2);
});

test('UK source PR rejects any wider file scope', () => {
  const result = { source_additions: 1, source_pr: { pr_number: 12, branch: 'sources/cloud-uk-growth-0123456789abcdef-base-0123456789abcdef' } };
  const pr = {
    number: 12, state: 'OPEN', merged: false, draft: false,
    base_ref: 'main', base_sha: 'a'.repeat(40), head_sha: 'b'.repeat(40), head_ref: result.source_pr.branch,
    files: [UK_SOURCE_REGISTRY_PATH, 'README.md'], check_runs: successfulChecks(),
    body: '- net-new public-service sources: 1\n- source removals: forbidden\n- automatic merge: disabled'
  };
  assert.throws(() => validateUkSourcePr(result, pr), /uk_source_pr_file_scope_invalid/);
});

test('valid UK data PR is additions-only and scoped to snapshot/homepage', () => {
  const result = {
    manifest_additions: 3,
    production_count_before: 289,
    production_count_after_planned: 292,
    opportunity_pr: { pr_number: 44, branch: 'data/cloud-uk-approved-additions-0123456789abcdef-base-0123456789abcdef', additions: 3 }
  };
  const pr = {
    number: 44,
    state: 'OPEN', merged: false, draft: false,
    base_ref: 'main', base_sha: 'c'.repeat(40), head_sha: 'd'.repeat(40),
    head_ref: result.opportunity_pr.branch,
    files: [UK_SNAPSHOT_PATH, UK_HOMEPAGE_PATH],
    check_runs: successfulChecks(),
    body: '- production snapshot: 289 -> 292\n- net-new additions: 3\n- updates: forbidden\n- removals: forbidden\n- automatic merge: disabled'
  };
  const validated = validateUkDataPr(result, pr);
  assert.equal(validated.ready, true);
  assert.equal(validated.after, 292);
});

test('UK data PR remains pending while checks are incomplete', () => {
  const result = {
    manifest_additions: 1,
    production_count_before: 289,
    production_count_after_planned: 290,
    opportunity_pr: { pr_number: 45, branch: 'data/cloud-uk-approved-additions-fedcba9876543210-base-fedcba9876543210', additions: 1 }
  };
  const pr = {
    number: 45,
    state: 'OPEN', merged: false, draft: false,
    base_ref: 'main', base_sha: 'e'.repeat(40), head_sha: 'f'.repeat(40),
    head_ref: result.opportunity_pr.branch,
    files: [UK_SNAPSHOT_PATH],
    check_runs: [{ id: 2, name: 'verify', status: 'in_progress', conclusion: null }],
    body: '- production snapshot: 289 -> 290\n- net-new additions: 1\n- updates: forbidden\n- removals: forbidden\n- automatic merge: disabled'
  };
  assert.equal(validateUkDataPr(result, pr).ready, false);
});

test('UK controller can validate an already-merged generated source PR before reusing its merge', () => {
  const result = {
    source_additions: 2,
    source_pr: { pr_number: 12, branch: 'sources/cloud-uk-growth-0123456789abcdef-base-0123456789abcdef', additions: 2 }
  };
  const pr = {
    number: 12,
    state: 'CLOSED', merged: true, merged_at: '2026-09-18T06:03:30Z', merge_commit_sha: 'c'.repeat(40), draft: false,
    base_ref: 'main', base_sha: 'a'.repeat(40), head_sha: 'b'.repeat(40),
    head_ref: result.source_pr.branch,
    files: [UK_SOURCE_REGISTRY_PATH],
    check_runs: successfulChecks(),
    body: '- net-new public-service sources: 2\n- source removals: forbidden\n- automatic merge: disabled'
  };
  const validated = validateUkSourcePr(result, pr);
  assert.equal(validated.ready, true);
  assert.equal(validated.pr_number, 12);
});

test('UK controller can validate an already-merged generated data PR before reusing its merge', () => {
  const result = {
    manifest_additions: 1,
    production_count_before: 289,
    production_count_after_planned: 290,
    opportunity_pr: { pr_number: 45, branch: 'data/cloud-uk-approved-additions-fedcba9876543210-base-fedcba9876543210', additions: 1 }
  };
  const pr = {
    number: 45,
    state: 'CLOSED', merged: true, merged_at: '2026-09-18T06:03:30Z', merge_commit_sha: '1'.repeat(40), draft: false,
    base_ref: 'main', base_sha: 'e'.repeat(40), head_sha: 'f'.repeat(40),
    head_ref: result.opportunity_pr.branch,
    files: [UK_SNAPSHOT_PATH],
    check_runs: successfulChecks(),
    body: '- production snapshot: 289 -> 290\n- net-new additions: 1\n- updates: forbidden\n- removals: forbidden\n- automatic merge: disabled'
  };
  const validated = validateUkDataPr(result, pr);
  assert.equal(validated.ready, true);
  assert.equal(validated.after, 290);
});
