import assert from 'node:assert/strict';
import test from 'node:test';

import {
  branchBasePrefix,
  validateSnapshotEquivalentMainDrift
} from '../../cloudflare-texas-acquisition/scripts/auto-merge-base.mjs';

const oldBase = 'a'.repeat(40);
const currentMain = 'b'.repeat(40);
const snapshotBlob = 'c'.repeat(40);

test('US auto-merge accepts unrelated main drift when the production snapshot blob is unchanged', () => {
  assert.equal(branchBasePrefix(`data/cloud-virginia-growth-abc-base-${oldBase.slice(0, 16)}`), oldBase.slice(0, 16));
  assert.deepEqual(validateSnapshotEquivalentMainDrift({
    currentMainSha: currentMain,
    prBaseSha: currentMain,
    branchBaseSha: oldBase,
    branchBaseIsAncestor: true,
    snapshotBlobAtBranchBase: snapshotBlob,
    snapshotBlobAtCurrentMain: snapshotBlob
  }), { branchBaseSha: oldBase, reconciledMainDrift: true });
});

test('US auto-merge fails closed when the US production snapshot changed', () => {
  assert.throws(() => validateSnapshotEquivalentMainDrift({
    currentMainSha: currentMain,
    prBaseSha: currentMain,
    branchBaseSha: oldBase,
    branchBaseIsAncestor: true,
    snapshotBlobAtBranchBase: snapshotBlob,
    snapshotBlobAtCurrentMain: 'd'.repeat(40)
  }), /US production snapshot changed/);
});

test('US auto-merge fails closed for non-ancestor or stale PR base provenance', () => {
  assert.throws(() => validateSnapshotEquivalentMainDrift({
    currentMainSha: currentMain,
    prBaseSha: currentMain,
    branchBaseSha: oldBase,
    branchBaseIsAncestor: false,
    snapshotBlobAtBranchBase: snapshotBlob,
    snapshotBlobAtCurrentMain: snapshotBlob
  }), /not an ancestor/);
  assert.throws(() => validateSnapshotEquivalentMainDrift({
    currentMainSha: currentMain,
    prBaseSha: 'e'.repeat(40),
    branchBaseSha: oldBase,
    branchBaseIsAncestor: true,
    snapshotBlobAtBranchBase: snapshotBlob,
    snapshotBlobAtCurrentMain: snapshotBlob
  }), /exact current main/);
});
