import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCanadaOpportunityRow,
  pollCanadaApprovedSource,
  pollCanadaApprovedSources
} from '../operations/cloudflare-global-acquisition/lib/ca-opportunity-acquisition.mjs';

function source(overrides = {}) {
  return {
    id: 'ca-on-aaaaaaaaaaaa',
    name: 'Ontario Market Vendor Application',
    source_url: 'https://www.ontario.ca/page/market-vendors',
    application_url: 'https://www.ontario.ca/page/market-vendors',
    source_class: 'public-service',
    country_code: 'CA',
    jurisdiction: 'CA-ON',
    region_code: 'ON',
    region_name: 'Ontario',
    status: 'approved-pilot',
    ...overrides
  };
}

const page = {
  url: 'https://www.ontario.ca/page/market-vendors',
  text: 'Ontario market vendors can apply using the application form. Food vendors and artisans must register before the deadline and pay the vendor fee.'
};

test('Canada approved source produces a deterministic customer-ready Canada row', () => {
  const first = buildCanadaOpportunityRow(source(), page, { now: '2026-09-13T16:00:00.000Z' });
  const second = buildCanadaOpportunityRow(source(), page, { now: '2026-09-13T16:05:00.000Z' });

  assert.match(first.id, /^CA-OPP-[A-F0-9]{12}$/);
  assert.equal(first.id, second.id);
  assert.equal(first.country, 'Canada');
  assert.equal(first.jurisdiction, 'CA-ON');
  assert.equal(first.currency, 'CAD');
  assert.equal(first.region, 'Ontario');
  assert.equal(first.publishable, true);
  assert.equal(first.quality_status, 'customer_ready');
  assert.match(first.vendor_categories, /food vendors/);
  assert.match(first.vendor_categories, /artisans/);
});

test('Canada approved-source poll holds negative or non-actionable pages', async () => {
  const negative = await pollCanadaApprovedSource(source(), {
    fetchPage: async () => ({ url: page.url, text: 'Ontario applications closed. Not accepting vendors.' }),
    now: '2026-09-13T16:00:00.000Z'
  });
  assert.equal(negative.status, 'held');

  const missingAction = await pollCanadaApprovedSource(source(), {
    fetchPage: async () => ({ url: page.url, text: 'Ontario market vendor information and general market history.' }),
    now: '2026-09-13T16:00:00.000Z'
  });
  assert.equal(missingAction.status, 'held');
});

test('Canada approved-source batch deduplicates source IDs and reports zero Serper use', async () => {
  const result = await pollCanadaApprovedSources([source(), source()], {
    fetchPage: async () => page,
    now: '2026-09-13T16:00:00.000Z',
    concurrency: 2
  });
  assert.equal(result.source_count, 1);
  assert.equal(result.passed_count, 1);
  assert.equal(result.held_count, 0);
  assert.equal(result.rows.length, 1);
  assert.equal(result.serper_credits_used, 0);
});
