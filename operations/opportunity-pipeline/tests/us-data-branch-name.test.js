import test from 'node:test';
import assert from 'node:assert/strict';

import { dataBranchName } from '../../cloudflare-texas-acquisition/src/data-branch-name.js';

const state = { slug: 'california' };
const promotion = { rows_sha256: '8ddb0dc290296116a510b7e66c9c727b053f8be28d1a7351967f9be675a66867' };

test('data branches are bound to the exact main snapshot used for planning', () => {
  const oldMain = 'd89a56fd434fe3df7213742139f1005cd6d40b5c';
  const currentMain = '7d0183251f3c41cfbe5fc70031f5017f05448301';
  const oldBranch = dataBranchName(state, promotion, oldMain);
  const currentBranch = dataBranchName(state, promotion, currentMain);

  assert.notEqual(currentBranch, oldBranch);
  assert.equal(oldBranch, 'data/cloud-california-growth-8ddb0dc290296116-base-d89a56fd434fe3df');
  assert.equal(currentBranch, 'data/cloud-california-growth-8ddb0dc290296116-base-7d0183251f3c41cf');
});

test('data branch naming fails closed for malformed state and SHA inputs', () => {
  assert.throws(() => dataBranchName({ slug: '../main' }, promotion, '7d0183251f3c41cfbe5fc70031f5017f05448301'), /Invalid state slug/);
  assert.throws(() => dataBranchName(state, { rows_sha256: 'bad' }, '7d0183251f3c41cfbe5fc70031f5017f05448301'), /Invalid promotion rows SHA/);
  assert.throws(() => dataBranchName(state, promotion, 'bad'), /Invalid main SHA/);
});
