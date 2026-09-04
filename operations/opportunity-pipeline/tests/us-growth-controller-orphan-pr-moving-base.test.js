import assert from 'node:assert/strict';
import test from 'node:test';

import { deferredUnitMatchesAcquisitionPr } from '../../cloudflare-texas-acquisition/scripts/growth-controller.mjs';

const originalBase = 'c'.repeat(40);
const currentMain = 'd'.repeat(40);

const pr = {
  number: 825,
  state: 'OPEN',
  isDraft: false,
  baseRefName: 'main',
  baseRefOid: currentMain,
  headParentOid: originalBase,
  headRefName: `sources/cloud-us-massachusetts-growth-deadbeef-base-${originalBase.slice(0, 16)}`,
  body: '- state: Massachusetts (MA)\n- additions only; no source removals\n',
  files: [{ path: 'operations/opportunity-pipeline/config/us-growth-source-registry.json' }],
  commits: [{ oid: 'e'.repeat(40) }]
};

const state = {
  status: 'ready',
  active_instance: null,
  current: null,
  deferred_units: [{ mode: 'discover', state_code: 'MA', query_offset: 136, query_limit: 2, disposition: 'deferred_for_replay' }],
  deferred_replay_inflight: null
};

test('orphan PR remains provable after main advances beyond the PR original base', () => {
  assert.equal(deferredUnitMatchesAcquisitionPr(pr, state), true);
});

test('orphan PR fails closed when its commit parent does not match the branch encoded base', () => {
  assert.equal(deferredUnitMatchesAcquisitionPr({ ...pr, headParentOid: 'f'.repeat(40) }, state), false);
});
