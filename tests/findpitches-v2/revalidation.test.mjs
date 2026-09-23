import test from 'node:test';
import assert from 'node:assert/strict';

import { createRevalidator } from '../../platform/findpitches-v2/revalidation/index.mjs';

test('revalidator keeps current opportunities active', async () => {
  const revalidator = createRevalidator({
    fetchProvider: {
      async fetch(url) {
        return { final_url: url, body: '<html><body>Vendor applications are open for 2027.</body></html>' };
      }
    },
    now: () => new Date('2026-09-19T00:00:00Z')
  });

  const result = await revalidator.revalidate({
    id: 'a',
    market: 'GB',
    canonical_url: 'https://example.test/apply'
  });

  assert.equal(result.status, 'current');
  assert.equal(result.action, 'none');
  assert.equal(result.automatic_delete, false);
});

test('closed application becomes archive candidate, never automatic delete', async () => {
  const revalidator = createRevalidator({
    fetchProvider: {
      async fetch(url) {
        return { final_url: url, body: '<html><body>Vendor applications closed.</body></html>' };
      }
    }
  });

  const result = await revalidator.revalidate({
    id: 'a',
    market: 'US',
    canonical_url: 'https://example.test/apply'
  });

  assert.equal(result.status, 'archive_candidate');
  assert.equal(result.action, 'review_archive');
  assert.equal(result.reason, 'applications_closed');
  assert.equal(result.automatic_delete, false);
});

test('fetch failure becomes retry, not deletion', async () => {
  const revalidator = createRevalidator({
    fetchProvider: {
      async fetch() {
        throw new Error('timeout');
      }
    }
  });

  const result = await revalidator.revalidate({
    id: 'a',
    market: 'CA',
    canonical_url: 'https://example.test/apply'
  });

  assert.equal(result.status, 'recheck_required');
  assert.equal(result.action, 'retry');
  assert.equal(result.automatic_delete, false);
});
