import assert from 'node:assert/strict';
import test from 'node:test';

import {
  auditUsOpportunities,
  renderAuditMarkdown
} from '../../cloudflare-texas-acquisition/scripts/us-quality-audit.mjs';

const states = [
  { code: 'TX', name: 'Texas' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'MA', name: 'Massachusetts' }
];

function row(overrides = {}) {
  return {
    stable_id: 'opp_one',
    event_name: 'Town Market 2026',
    organiser: 'Town Council',
    source_url: 'https://town.gov/market',
    application_url: 'https://town.gov/apply',
    location: 'Town',
    locality: 'Town',
    region_code: 'TX',
    country_code: 'US',
    currency: 'USD',
    recurring: false,
    multi_event: false,
    event_start: '2026-10-01',
    event_end: '2026-10-02',
    application_deadline: '2026-09-20',
    vendor_categories: ['market_vendor'],
    quality_status: 'customer_ready',
    publishable: true,
    source_id: 'tx-town-market',
    ...overrides
  };
}

test('quality audit reports coverage, valid records and thin states', () => {
  const audit = auditUsOpportunities({
    total: 2,
    exported_at: '2026-09-04T09:00:00Z',
    rows: [
      row(),
      row({ stable_id: 'opp_two', source_id: 'az-market', region_code: 'AZ', event_name: 'Phoenix Fall Market', locality: 'Phoenix', location: 'Phoenix', source_url: 'https://phoenix.gov/market', application_url: 'https://phoenix.gov/apply' })
    ]
  }, { states, now: new Date('2026-09-04T12:00:00Z'), thinThreshold: 2 });

  assert.equal(audit.total, 2);
  assert.equal(audit.summary.states_populated, 2);
  assert.equal(audit.summary.states_empty, 1);
  assert.equal(audit.summary.states_thin, 2);
  assert.equal(audit.summary.critical_issues, 0);
  assert.equal(audit.summary.warnings, 0);
  assert.equal(audit.summary.duplicate_risk_groups, 0);
  assert.equal(audit.empty_states[0].code, 'MA');
  assert.match(renderAuditMarkdown(audit), /States populated: \*\*2\/3\*\*/);
});

test('quality audit separates presentation flags from data-quality failures', () => {
  const audit = auditUsOpportunities({
    total: 1,
    rows: [row({ event_name: 'Form Center • 2026 Community Market Vendor Application' })]
  }, { states: [states[0]], now: new Date('2026-09-04T12:00:00Z') });

  assert.equal(audit.summary.critical_issues, 0);
  assert.equal(audit.summary.warnings, 0);
  assert.equal(audit.summary.presentation_flags, 1);
  assert.match(audit.presentation_flags[0].reason, /scraped page chrome/);
});

test('quality audit flags invalid, expired and non-HTTPS records', () => {
  const audit = auditUsOpportunities({
    total: 1,
    rows: [row({
      event_name: '', organiser: '', source_url: 'http://town.gov/market', application_url: '', locality: '', location: '',
      country_code: 'CA', currency: 'CAD', quality_status: 'review', publishable: false,
      application_deadline: '2026-01-01', event_start: '2026-02-01', event_end: '2026-02-02'
    })]
  }, { states: [states[0]], now: new Date('2026-09-04T12:00:00Z') });

  assert.ok(audit.summary.critical_issues >= 3);
  assert.ok(audit.summary.warnings >= 6);
  assert.ok(audit.score < 100);
  assert.match(renderAuditMarkdown(audit), /Data-quality findings/);
});

test('quality audit surfaces duplicate risk without deleting anything', () => {
  const first = row();
  const second = row({ stable_id: 'opp_two' });
  const audit = auditUsOpportunities({ total: 2, rows: [first, second] }, { states: [states[0]], now: new Date('2026-09-04T12:00:00Z') });

  assert.ok(audit.duplicates.source_id.length >= 1);
  assert.ok(audit.duplicates.source_url.length >= 1);
  assert.ok(audit.duplicates.application_url.length >= 1);
  assert.ok(audit.duplicates.normalized_name_locality_state.length >= 1);
  assert.ok(audit.summary.duplicate_risk_groups >= 4);
});
