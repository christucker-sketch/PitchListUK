import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertCustomerReadyRow,
  canadaOpportunityBranchName,
  planCanadaOpportunityAdditions
} from '../operations/cloudflare-global-acquisition/lib/ca-opportunity-publication.mjs';

function row(overrides = {}) {
  return {
    id: 'CA-OPP-AAAAAAAAAAAA',
    event_name: 'Ontario Market Vendor Application',
    organiser: 'ontario.ca',
    location: 'Ontario',
    county: '',
    region: 'Ontario',
    event_start: '',
    event_end: '',
    application_deadline: '',
    stall_fee: '',
    vendor_categories: 'market vendors; artisans',
    last_checked: '2026-09-13',
    freshness_status: 'fresh',
    freshness_age_days: 0,
    confidence: 'high',
    quality_status: 'customer_ready',
    publishable: true,
    area_confidence: 'exact',
    route_type: 'market_vendor_application',
    organiser_type: 'public_service',
    country: 'Canada',
    jurisdiction: 'CA-ON',
    currency: 'CAD',
    market_domain: 'findpitches.com',
    tax_region: 'CA-ON',
    buyer_fit_tags: 'canada;on;vendor_application',
    notes: 'Official Canadian public-service vendor route.',
    application_url: 'https://www.ontario.ca/page/market-vendors',
    source_url: 'https://www.ontario.ca/page/market-vendors',
    ...overrides
  };
}

function base(rows = []) {
  return {
    mainSha: 'a'.repeat(40),
    snapshot: {
      exported_at: '2026-09-13T00:00:00.000Z',
      source: 'canada-shadow-bootstrap',
      total: rows.length,
      rows
    }
  };
}

test('Canada opportunity publication plans deterministic additions only', () => {
  const candidate = row();
  const first = planCanadaOpportunityAdditions(base(), [candidate], {
    generated_at: '2026-09-13T16:00:00.000Z',
    max_additions: 10
  });
  const second = planCanadaOpportunityAdditions(base(), [candidate], {
    generated_at: '2026-09-13T16:00:00.000Z',
    max_additions: 10
  });

  assert.deepEqual(first, second);
  assert.deepEqual(first.summary, { before_count: 0, additions: 1, updates: 0, removals: 0, after_count: 1 });
  assert.equal(first.snapshot.total, 1);
  assert.equal(first.snapshot.rows[0].id, candidate.id);
  assert.match(first.snapshot.source, /^cloudflare-canada-additions:[a-f0-9]{16}$/);
});

test('Canada opportunity publication never rewrites an existing identity or route', () => {
  const existing = row();
  const sameIdChangedRoute = row({ application_url: 'https://www.ontario.ca/page/other-market' });
  const sameRouteDifferentId = row({ id: 'CA-OPP-BBBBBBBBBBBB' });

  const idCollision = planCanadaOpportunityAdditions(base([existing]), [sameIdChangedRoute]);
  const routeCollision = planCanadaOpportunityAdditions(base([existing]), [sameRouteDifferentId]);

  assert.equal(idCollision.summary.additions, 0);
  assert.deepEqual(idCollision.snapshot.rows, [existing]);
  assert.equal(routeCollision.summary.additions, 0);
  assert.deepEqual(routeCollision.snapshot.rows, [existing]);
});

test('Canada opportunity publication caps additions and deduplicates candidate identities', () => {
  const candidates = [
    row(),
    row(),
    row({ id: 'CA-OPP-BBBBBBBBBBBB', application_url: 'https://www.ontario.ca/page/second-market' }),
    row({ id: 'CA-OPP-CCCCCCCCCCCC', application_url: 'https://www.ontario.ca/page/third-market' })
  ];
  const plan = planCanadaOpportunityAdditions(base(), candidates, { max_additions: 2 });
  assert.equal(plan.summary.additions, 2);
  assert.equal(plan.snapshot.total, 2);
  assert.deepEqual(plan.additions.map(item => item.id), ['CA-OPP-AAAAAAAAAAAA', 'CA-OPP-BBBBBBBBBBBB']);
});

test('Canada opportunity publication rejects malformed or non-customer-ready rows', () => {
  const invalid = [
    row({ id: 'OPP-123' }),
    row({ country: 'United States' }),
    row({ jurisdiction: 'US-CA' }),
    row({ currency: 'USD' }),
    row({ publishable: false }),
    row({ quality_status: 'held' }),
    row({ area_confidence: 'broad' }),
    row({ application_url: 'http://ontario.ca/vendors' })
  ];
  for (const candidate of invalid) {
    assert.throws(() => assertCustomerReadyRow(candidate));
    assert.throws(() => planCanadaOpportunityAdditions(base(), [candidate]));
  }
});

test('Canada opportunity data branch binds exact additions and main SHA', () => {
  const plan = planCanadaOpportunityAdditions(base(), [row()], { generated_at: '2026-09-13T16:00:00.000Z' });
  const mainSha = '91d50c6ec1bfdd6aa22533f6660f50b94b75f47a';
  const branch = canadaOpportunityBranchName(plan, mainSha);
  assert.match(branch, /^data\/cloud-ca-approved-additions-[a-f0-9]{16}-base-91d50c6ec1bfdd6a$/);
  assert.equal(branch, canadaOpportunityBranchName(plan, mainSha));
});
