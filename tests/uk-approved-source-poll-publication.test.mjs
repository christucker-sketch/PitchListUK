import assert from 'node:assert/strict';
import test from 'node:test';

import {
  approvedDirectSourceInventory,
  pollApprovedSourceBatch
} from '../operations/cloudflare-uk-canary/lib/uk-approved-source-poll.mjs';

function response(body, url) {
  return {
    ok: true,
    status: 200,
    url,
    async text() { return body; }
  };
}

async function boroughPoll(includeReviewedRow) {
  const source = approvedDirectSourceInventory().find(item => item.host === 'boroughmarket.org.uk');
  assert.ok(source, 'Borough Market approved route missing');
  return pollApprovedSourceBatch({
    sources: [source],
    now: '2026-09-08T16:10:00.000Z',
    include_reviewed_row: includeReviewedRow,
    fetchWithPolicy: async url => ({
      ok: true,
      attempts: 1,
      final_url: url,
      response: response('<html><body>Apply to become a trader. Trader applications are open. <a href="/become-a-trader/">Apply</a></body></html>', url)
    })
  });
}

test('UK read-only poll does not expose full reviewed rows by default', async () => {
  const report = await boroughPoll(false);
  assert.equal(report.results[0].quality_status, 'customer_ready');
  assert.equal('reviewed_row' in report.results[0], false);
});

test('UK publication planning can explicitly request the full evaluated row', async () => {
  const report = await boroughPoll(true);
  assert.equal(report.results[0].quality_status, 'customer_ready');
  assert.equal(report.results[0].reviewed_row.quality_status, 'customer_ready');
  assert.equal(report.results[0].reviewed_row.publishable, true);
  assert.ok(report.results[0].reviewed_row.source_evidence);
});
