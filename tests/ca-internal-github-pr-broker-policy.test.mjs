import assert from 'node:assert/strict';
import test from 'node:test';

import { validateInternalGithubPrPayload } from '../operations/cloudflare-texas-acquisition/src/internal-github-pr-broker.js';

function payload(head) {
  return { head, base: 'main', title: 'Guarded acquisition PR', body: 'evidence' };
}

test('internal GitHub PR broker permits only the guarded UK and Canada acquisition branch families', () => {
  for (const head of [
    'sources/cloud-uk-growth-abc123-base-deadbeef',
    'data/cloud-uk-approved-additions-abc123-base-deadbeef',
    'sources/cloud-ca-growth-6cac311647f1e261-base-66a27238fea7cd2f',
    'data/cloud-ca-approved-additions-abc123-base-deadbeef'
  ]) {
    assert.equal(validateInternalGithubPrPayload(payload(head)).head, head);
  }

  for (const head of [
    'sources/cloud-us-growth-abc123',
    'feat/canada-live-acquisition-cutover',
    'sources/cloud-ca-evil-abc123',
    'data/cloud-ca-approved-additions-../../main'
  ]) {
    assert.throws(() => validateInternalGithubPrPayload(payload(head)), /internal_github_pr_head_rejected/);
  }
});
