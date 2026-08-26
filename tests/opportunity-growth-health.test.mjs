import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { DEFAULT_MAX_DATASET_AGE_HOURS, alertNotification, evaluateOpportunityHealth } = require('../scripts/check-opportunity-growth-health.js');

const headers = `Content-Security-Policy: x\nX-Frame-Options: DENY\nX-Content-Type-Options: nosniff\nReferrer-Policy: strict-origin-when-cross-origin\nPermissions-Policy: x`;
const row = overrides => ({ country: 'United Kingdom', jurisdiction: 'GB', region: 'North East', location: 'Northumberland', event_end: '', ...overrides });

test('healthy production reports growth, clean geography, coverage, headers and exact SHA', () => {
  const rows = [...Array(12)].map(() => row()).concat([...Array(4)].map(() => row({ region: 'South Yorkshire', location: 'Sheffield' })));
  const result = evaluateOpportunityHealth({ now: '2026-08-21T16:00:00Z', snapshot: { exported_at: '2026-08-21T15:00:00Z', rows }, receipts: [{ generated_at: '2026-08-21T15:30:00Z', before_count: 279, after_count: 282 }], headers, cloudflareSha: 'abc', expectedSha: 'abc' });
  assert.equal(result.healthy, true);
  assert.equal(result.metrics.foreign_records, 0);
});

test('alerts cover stale or shrinking quality, failed growth, contamination, headers, SHA and low credits', () => {
  const result = evaluateOpportunityHealth({ now: '2026-08-21T16:00:00Z', snapshot: { exported_at: '2026-07-01T00:00:00Z', rows: [row({ country: 'United States', jurisdiction: 'US', event_end: '2026-01-01' })] }, receipts: [], headers: '', cloudflareSha: 'old', expectedSha: 'new', serperRemaining: 10, serperReserve: 100 });
  const codes = result.alerts.map(item => item.code);
  for (const code of ['production_dataset_stale', 'zero_valid_growth_7_days', 'foreign_contamination', 'expired_production_records', 'north_east_coverage_regression', 'south_yorkshire_coverage_regression', 'required_security_header_missing', 'production_sha_mismatch', 'serper_credits_low']) assert.ok(codes.includes(code));
});

test('default dataset-age threshold covers the longest approved-source polling interval', () => {
  assert.equal(DEFAULT_MAX_DATASET_AGE_HOURS, 744);
  const result = evaluateOpportunityHealth({
    now: '2026-08-26T07:00:00Z',
    snapshot: { exported_at: '2026-08-21T15:29:34Z', rows: [] },
    receipts: [], headers, cloudflareSha: 'abc', expectedSha: 'abc',
    minNorthEast: 0, minSouthYorkshire: 0
  });
  assert.equal(result.alerts.some(item => item.code === 'production_dataset_stale'), false);
});

test('notification fingerprint ignores a changing stale-age counter but preserves material count changes', () => {
  const first = alertNotification({ alerts: [
    { code: 'production_dataset_stale', detail: 109 },
    { code: 'expired_production_records', detail: 1 }
  ] });
  const later = alertNotification({ alerts: [
    { code: 'production_dataset_stale', detail: 133 },
    { code: 'expired_production_records', detail: 1 }
  ] });
  const moreExpired = alertNotification({ alerts: [
    { code: 'production_dataset_stale', detail: 133 },
    { code: 'expired_production_records', detail: 2 }
  ] });
  assert.equal(first.fingerprint, later.fingerprint);
  assert.notEqual(first.fingerprint, moreExpired.fingerprint);
  assert.equal(first.summary, 'production_dataset_stale=109, expired_production_records=1');
});

test('growth health reports source targets, candidate backlog and material net-growth targets', () => {
  const rows = [...Array(20)].map(() => row());
  const result = evaluateOpportunityHealth({
    now: '2026-08-26T12:00:00Z', snapshot: { exported_at: '2026-08-26T11:00:00Z', rows },
    receipts: [{ generated_at: '2026-08-25T12:00:00Z', before_count: 15, after_count: 20 }], headers,
    cloudflareSha: 'abc', expectedSha: 'abc', minNorthEast: 0, minSouthYorkshire: 0,
    sources: [{ observed_yield: { customer_ready: 0 } }, { observed_yield: { customer_ready: 2 } }],
    sourceCandidates: [{ approval_status: 'pending', classification: 'manual-review-required' }],
    targetProductionListings: 400, targetApprovedSources: 100, minNetGrowth7Days: 20
  });
  const codes = result.alerts.map(item => item.code);
  for (const code of ['production_listing_target_missed', 'approved_source_target_missed', 'growth_target_missed']) assert.ok(codes.includes(code));
  assert.equal(result.metrics.net_additions_7_days, 5);
  assert.equal(result.metrics.candidate_backlog, 1);
  assert.equal(result.metrics.candidates_awaiting_review, 1);
  assert.equal(result.metrics.approved_sources_zero_yield, 1);
});
