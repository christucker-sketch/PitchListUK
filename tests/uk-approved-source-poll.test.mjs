import assert from 'node:assert/strict';
import test from 'node:test';

import {
  UK_APPROVED_SOURCE_POLL_LIMITS,
  approvedDirectSourceInventory,
  pollApprovedSourceBatch,
  sourcePollBatches,
  summarizeApprovedSourcePoll
} from '../operations/cloudflare-uk-canary/lib/uk-approved-source-poll.mjs';

function response(body, options = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    url: options.url || '',
    async text() { return body; }
  };
}

test('UK approved-source inventory is deterministic, routable and duplicate-free', () => {
  const inventory = approvedDirectSourceInventory();
  assert.ok(inventory.length >= 3);
  assert.equal(new Set(inventory.map(item => item.official_application_route)).size, inventory.length);
  assert.ok(inventory.every(item => item.official_application_route.startsWith('https://')));
  const batches = sourcePollBatches(undefined, { batch_size: 8 });
  assert.equal(batches.flat().length, inventory.length);
  assert.ok(batches.every(batch => batch.length >= 1 && batch.length <= 8));
  assert.equal(UK_APPROVED_SOURCE_POLL_LIMITS.maximum_batch_size, 10);
});

test('Cloudflare UK poll runs the existing extractor and quality gates on an approved route', async () => {
  const source = approvedDirectSourceInventory().find(item => item.host === 'boroughmarket.org.uk');
  assert.ok(source, 'Borough Market approved route missing');
  const fetchWithPolicy = async url => ({
    ok: true,
    attempts: 1,
    final_url: url,
    response: response('<html><head><title>Become a trader</title></head><body>Apply to become a trader. Trader applications are open. <a href="/become-a-trader/">Apply</a></body></html>', { url })
  });
  const report = await pollApprovedSourceBatch({
    sources: [source],
    now: '2026-09-08T15:30:00.000Z',
    fetchWithPolicy
  });
  assert.equal(report.source_count, 1);
  assert.equal(report.passed_count, 1);
  assert.equal(report.held_count, 0);
  assert.equal(report.rejected_count, 0);
  assert.equal(report.results[0].quality_status, 'customer_ready');
  assert.equal(report.results[0].publishable, true);
  assert.equal(report.results[0].source_url, source.official_application_route);
});

test('Cloudflare UK poll fails closed on an unapproved redirect', async () => {
  const source = approvedDirectSourceInventory().find(item => item.host === 'boroughmarket.org.uk');
  assert.ok(source, 'Borough Market approved route missing');
  const report = await pollApprovedSourceBatch({
    sources: [source],
    now: '2026-09-08T15:30:00.000Z',
    fetchWithPolicy: async () => ({
      ok: true,
      attempts: 1,
      final_url: 'https://example.com/redirected',
      response: response('<html><body>Apply to trade</body></html>', { url: 'https://example.com/redirected' })
    })
  });
  assert.equal(report.passed_count, 0);
  assert.equal(report.held_count, 1);
  assert.equal(report.results[0].reason, 'redirect_outside_approved_source');
  assert.equal(report.results[0].publishable, false);
});

test('approved-source poll summary cannot imply discovery or publication', () => {
  const report = summarizeApprovedSourcePoll([{
    results: [
      { status: 'passed', quality_status: 'customer_ready' },
      { status: 'held', reason: 'network_error', quality_status: 'not_evaluated', quality_reasons: ['network_error'] }
    ]
  }], { generated_at: '2026-09-08T15:30:00.000Z', approved_registry_count: 68 });
  assert.equal(report.approved_registry_count, 68);
  assert.equal(report.direct_route_count, 2);
  assert.equal(report.passed_count, 1);
  assert.equal(report.held_count, 1);
  assert.equal(report.serper_credits_used, 0);
  assert.equal(report.discovery_attempted, false);
  assert.equal(report.source_pr_attempted, false);
  assert.equal(report.opportunity_pr_attempted, false);
  assert.equal(report.publication_attempted, false);
  assert.equal(report.mutation_attempted, false);
});
