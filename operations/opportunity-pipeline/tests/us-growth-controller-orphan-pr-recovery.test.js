import assert from 'node:assert/strict';
import test from 'node:test';

import { deferredUnitMatchesAcquisitionPr } from '../../cloudflare-texas-acquisition/scripts/growth-controller.mjs';

function sourcePr(overrides = {}) {
  const base = 'a'.repeat(40);
  return {
    number: 825,
    state: 'OPEN',
    isDraft: false,
    baseRefName: 'main',
    baseRefOid: base,
    headRefName: `sources/cloud-us-massachusetts-growth-deadbeef-base-${base.slice(0, 16)}`,
    body: '- state: Massachusetts (MA)\n- additions only; no source removals\n',
    files: [{ path: 'operations/opportunity-pipeline/config/us-growth-source-registry.json' }],
    commits: [{ oid: 'b'.repeat(40) }],
    ...overrides
  };
}

function deferredDiscoverState(overrides = {}) {
  return {
    status: 'ready',
    active_instance: null,
    current: null,
    deferred_units: [{
      mode: 'discover',
      state_code: 'MA',
      query_offset: 136,
      query_limit: 2,
      disposition: 'deferred_for_replay'
    }],
    deferred_replay_inflight: null,
    ...overrides
  };
}

test('exact source PR for a deferred discovery unit is eligible for safe close-unmerged recovery', () => {
  assert.equal(deferredUnitMatchesAcquisitionPr(sourcePr(), deferredDiscoverState()), true);
});

test('matching deferred replay inflight also proves an orphan source PR', () => {
  const state = deferredDiscoverState({
    deferred_units: [],
    deferred_replay_inflight: { mode: 'discover', state_code: 'MA', query_offset: 136, query_limit: 2 }
  });
  assert.equal(deferredUnitMatchesAcquisitionPr(sourcePr(), state), true);
});

test('unrelated state PR remains fail-closed', () => {
  assert.equal(deferredUnitMatchesAcquisitionPr(sourcePr(), deferredDiscoverState({
    deferred_units: [{ mode: 'discover', state_code: 'NY', disposition: 'deferred_for_replay' }]
  })), false);
});

test('PR with unexpected branch, base suffix or file remains fail-closed', () => {
  assert.equal(deferredUnitMatchesAcquisitionPr(sourcePr({ headRefName: 'sources/cloud-us-new-york-growth-x-base-aaaaaaaaaaaaaaaa' }), deferredDiscoverState()), false);
  assert.equal(deferredUnitMatchesAcquisitionPr(sourcePr({ headRefName: 'sources/cloud-us-massachusetts-growth-x-base-bbbbbbbbbbbbbbbb' }), deferredDiscoverState()), false);
  assert.equal(deferredUnitMatchesAcquisitionPr(sourcePr({ files: [{ path: 'README.md' }] }), deferredDiscoverState()), false);
});

test('active workflow or controller-owned review PR is never auto-closed', () => {
  assert.equal(deferredUnitMatchesAcquisitionPr(sourcePr(), deferredDiscoverState({ active_instance: { id: `cf_${'c'.repeat(64)}` } })), false);
  assert.equal(deferredUnitMatchesAcquisitionPr(sourcePr(), deferredDiscoverState({ current: { source_pr: 825 } })), false);
});

test('exact data PR for deferred acquisition can be recovered but wrong file cannot', () => {
  const base = 'd'.repeat(40);
  const pr = sourcePr({
    number: 900,
    baseRefOid: base,
    headRefName: `data/cloud-massachusetts-growth-deadbeef-base-${base.slice(0, 16)}`,
    files: [{ path: 'functions/_data/us-opportunities.mjs' }]
  });
  const state = deferredDiscoverState({
    deferred_units: [{ mode: 'acquire', state_code: 'MA', batch_number: 1, disposition: 'deferred_for_replay' }]
  });
  assert.equal(deferredUnitMatchesAcquisitionPr(pr, state), true);
  assert.equal(deferredUnitMatchesAcquisitionPr({ ...pr, files: [{ path: 'operations/opportunity-pipeline/config/us-growth-source-registry.json' }] }, state), false);
});
