import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { evaluateOpportunityHealth } = require('../scripts/check-opportunity-growth-health.js');

const headers = `Content-Security-Policy: x\nX-Frame-Options: DENY\nX-Content-Type-Options: nosniff\nReferrer-Policy: strict-origin-when-cross-origin\nPermissions-Policy: x`;
const row = overrides => ({ country: 'United Kingdom', jurisdiction: 'GB', region: 'North East', location: 'Northumberland', event_end: '', ...overrides });

test('healthy production reports growth, clean geography, coverage, headers and exact SHA', () => {
  const rows = [...Array(12)].map(() => row()).concat([...Array(4)].map(() => row({ region: 'South Yorkshire', location: 'Sheffield' })));
  const result = evaluateOpportunityHealth({ now: '2026-08-21T16:00:00Z', snapshot: { exported_at: '2026-08-21T15:00:00Z', rows }, receipts: [{ generated_at: '2026-08-21T15:30:00Z', before_count: 279, after_count: 282 }], headers, cloudflareSha: 'abc', expectedSha: 'abc' });
  assert.equal(result.healthy, true);
  assert.equal(result.metrics.foreign_records, 0);
});

test('alerts cover stale or shrinking quality, failed growth, contamination, headers, SHA and low credits', () => {
  const result = evaluateOpportunityHealth({ now: '2026-08-21T16:00:00Z', snapshot: { exported_at: '2026-08-01T00:00:00Z', rows: [row({ country: 'United States', jurisdiction: 'US', event_end: '2026-01-01' })] }, receipts: [], headers: '', cloudflareSha: 'old', expectedSha: 'new', serperRemaining: 10, serperReserve: 100 });
  const codes = result.alerts.map(item => item.code);
  for (const code of ['production_dataset_stale', 'zero_valid_growth_7_days', 'foreign_contamination', 'expired_production_records', 'north_east_coverage_regression', 'south_yorkshire_coverage_regression', 'required_security_header_missing', 'production_sha_mismatch', 'serper_credits_low']) assert.ok(codes.includes(code));
});
