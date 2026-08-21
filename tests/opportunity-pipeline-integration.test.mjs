import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { sourceCandidateToRow } = require('../operations/opportunity-pipeline/acquisition/extract');
const { reviewRows } = require('../operations/opportunity-pipeline/scripts/clean-staged-events');
const { validateManifest, planChanges } = require('../scripts/lib/reviewed-opportunity-publisher');

const reviewedCommit = 'a'.repeat(40);
const today = '2026-08-21';

function fixture(url, title, snippet, html, lane = 'county-county-durham') {
  return sourceCandidateToRow({ url, title, snippet, query_lane: lane, query: `${title} trader application` }, html, today);
}

test('discovery fixture flows through validation, dedupe, staging and publisher dry-run fail-closed', () => {
  const rows = [
    fixture(
      'https://durham.gov.uk/article/market-trader-applications',
      'Durham Autumn Market',
      'Trader applications are open',
      '<h1>Durham Autumn Market</h1><p>Trader applications are open for 10 October 2026 at Durham Market in County Durham.</p><a href="/apply">Apply as a trader</a>'
    ),
    fixture(
      'https://newcastle.gov.uk/events/durham-autumn-market?utm_source=search',
      'Apply to trade at Durham Autumn Market 2026',
      'Trader applications are open',
      '<h1>Apply to trade at Durham Autumn Market</h1><p>10 October 2026 at Durham Market in County Durham.</p><a href="/apply">Trader application</a>'
    ),
    fixture(
      'https://newcastlede.gov/vendors',
      'Newcastle vendor event',
      'Newcastle, Delaware vendor application',
      '<p>Newcastle, Delaware. Vendor applications open.</p><a href="/apply">Apply</a>'
    ),
    fixture(
      'https://sunderland.gov.uk/events/expired-fair',
      'Sunderland Summer Fair',
      'Trader application',
      '<p>Event 10 July 2026 to 11 July 2026. Apply as a trader.</p><a href="/apply">Apply</a>'
    ),
    fixture(
      'https://gateshead.gov.uk/events/closed-market',
      'Gateshead Market',
      'Trader application',
      '<p>Applications are now closed for the market on 10 October 2026.</p><a href="/apply">Apply</a>'
    ),
    fixture(
      'https://northumberland.gov.uk/business/street-trading',
      'Street trading licence',
      'General permission information',
      '<p>Apply for street trading consent in Northumberland.</p><a href="/apply">Apply</a>'
    ),
    fixture(
      'https://stockton.gov.uk/events/information',
      'Stockton event information',
      'Visitor information',
      '<p>Visitor information for Stockton, England.</p>'
    )
  ];

  const reviewed = reviewRows(rows, { now: new Date('2026-08-21T00:00:00Z') });
  assert.equal(reviewed.customerReady.length, 1);
  assert.equal(reviewed.customerReady[0].event_name.includes('Durham Autumn Market'), true);
  assert.equal(reviewed.reviewed.some(row => row.duplicate_count === 2), true);
  assert.ok(reviewed.reviewed.some(row => row.quality_reasons.includes('non_uk_evidence')));
  assert.ok(reviewed.reviewed.some(row => row.quality_reasons.includes('event_expired')));
  assert.ok(reviewed.reviewed.some(row => row.quality_reasons.includes('application_closed')));
  assert.ok(reviewed.reviewed.some(row => row.quality_reasons.includes('available_pitch_evidence_missing')));
  assert.ok(reviewed.reviewed.some(row => row.quality_reasons.includes('direct_application_or_contact_missing')));

  const manifest = {
    manifest_version: 1,
    approval: { reviewed: true, approved_for_publish: true, reviewed_by: 'integration-test', reviewed_commit: reviewedCommit },
    changes: { additions: reviewed.customerReady.map(row => ({ reason: 'fixture-approved', row })), updates: [], removals: [] }
  };
  assert.equal(validateManifest(manifest, reviewedCommit), true);
  const dryRun = planChanges({ rows: [] }, manifest);
  assert.equal(dryRun.summary.before_count, 0);
  assert.equal(dryRun.summary.after_count, 1);

  for (const blocked of reviewed.reviewed.filter(row => row.quality_status !== 'customer_ready')) {
    const unsafe = { ...manifest, changes: { additions: [{ reason: 'must-fail', row: blocked }], updates: [], removals: [] } };
    assert.throws(() => validateManifest(unsafe, reviewedCommit), /non_customer_ready/);
  }
});
