const test = require('node:test');
const assert = require('node:assert/strict');

const { extractStateOpportunity } = require('../lib/us-state-row-core');
const { buildStatePromotionManifest, planStateProductionSnapshot } = require('../lib/us-state-publication-core');

const FL = Object.freeze({ code: 'FL', name: 'Florida', slug: 'florida', jurisdiction: 'US-FL' });
const SOURCE = Object.freeze({
  id: 'fl-test-market-2026',
  source_url: 'https://example.org/vendor-info',
  application_url: 'https://example.org/apply',
  status: 'approved-pilot',
  country_code: 'US',
  region_code: 'FL',
  jurisdiction: 'US-FL'
});

function annualFixture({ stableId, date, tracking = 'new' }) {
  const route = `https://www.eventeny.com/events/vendor/?id=27624&srsltid=${tracking}`;
  const source = {
    id: `fl-eventeny-${stableId}`,
    source_url: route,
    application_url: route,
    status: 'approved-pilot',
    country_code: 'US',
    region_code: 'FL',
    jurisdiction: 'US-FL'
  };
  const row = {
    stable_id: stableId,
    event_name: 'Annual Food Truck Festival',
    organiser: 'Example Festival',
    source_url: route,
    application_url: route,
    event_start: date,
    event_end: date,
    country_code: 'US',
    region_code: 'FL',
    jurisdiction: 'US-FL',
    quality_status: 'review',
    publishable: false
  };
  const staging = {
    country_code: 'US',
    region_code: 'FL',
    jurisdiction: 'US-FL',
    staging_only: true,
    automatic_publish: false,
    production_writes: false,
    rows: [row],
    held: []
  };
  const promotion = buildStatePromotionManifest(FL, staging, { sources: [source] });
  return { source, row, staging, promotion };
}

test('generic extractor emits state-scoped rows without Texas assumptions', () => {
  const result = extractStateOpportunity({
    title: 'Florida Fall Market Vendor Application',
    text: 'Vendor applications are open. Event date October 10, 2026. Hosted by Example Market.',
    url: SOURCE.source_url,
    application_url: SOURCE.application_url,
    organiser: 'Example Market',
    locality: 'Orlando'
  }, { state: FL });

  assert.equal(result.status, 'candidate');
  assert.equal(result.row.region_code, 'FL');
  assert.equal(result.row.region_name, 'Florida');
  assert.equal(result.row.jurisdiction, 'US-FL');
  assert.equal(result.row.country_code, 'US');
});

test('generic publication core enforces state isolation and addition-only planning', () => {
  const row = {
    stable_id: 'opp_us_testflorida000001',
    event_name: 'Florida Fall Market',
    organiser: 'Example Market',
    source_url: SOURCE.source_url,
    application_url: SOURCE.application_url,
    country_code: 'US',
    region_code: 'FL',
    jurisdiction: 'US-FL',
    quality_status: 'review',
    publishable: false
  };
  const staging = {
    country_code: 'US', region_code: 'FL', jurisdiction: 'US-FL', staging_only: true,
    automatic_publish: false, production_writes: false, rows: [row], held: []
  };
  const promotion = buildStatePromotionManifest(FL, staging, { sources: [SOURCE] });
  const plan = planStateProductionSnapshot(FL, { total: 0, rows: [] }, promotion, staging, { sources: [SOURCE] });

  assert.equal(promotion.region_code, 'FL');
  assert.equal(promotion.rows[0].publishable, true);
  assert.equal(plan.summary.additions, 1);
  assert.equal(plan.preview.rows[0].region_code, 'FL');

  const escaped = { ...staging, region_code: 'TX', jurisdiction: 'US-TX' };
  assert.throws(() => buildStatePromotionManifest(FL, escaped, { sources: [SOURCE] }), /Florida promotion requires/);
});

test('reused canonical vendor route with a different event year is a new occurrence', () => {
  const incoming = annualFixture({ stableId: 'opp_us_annual2027', date: '2027-09-20', tracking: 'incoming' });
  const existing = {
    ...incoming.promotion.rows[0],
    id: 'opp_us_annual2026',
    stable_id: 'opp_us_annual2026',
    source_url: 'https://www.eventeny.com/events/vendor/?id=27624&srsltid=existing',
    application_url: 'https://www.eventeny.com/events/vendor/?id=27624&srsltid=existing',
    event_start: '2026-09-20',
    event_end: '2026-09-20'
  };

  const plan = planStateProductionSnapshot(
    FL,
    { total: 1, rows: [existing] },
    incoming.promotion,
    incoming.staging,
    { sources: [incoming.source] }
  );

  assert.equal(plan.summary.already_present, 0);
  assert.equal(plan.summary.additions, 1);
  assert.deepEqual(plan.summary.added_ids, ['opp_us_annual2027']);
  assert.equal(plan.preview.total, 2);
});

test('same canonical vendor route and event date remains already present', () => {
  const incoming = annualFixture({ stableId: 'opp_us_recomputed', date: '2027-09-20', tracking: 'incoming' });
  const existing = {
    ...incoming.promotion.rows[0],
    id: 'opp_us_existing',
    stable_id: 'opp_us_existing',
    source_url: 'https://www.eventeny.com/events/vendor/?id=27624&srsltid=existing',
    application_url: 'https://www.eventeny.com/events/vendor/?id=27624&srsltid=existing'
  };

  const plan = planStateProductionSnapshot(
    FL,
    { total: 1, rows: [existing] },
    incoming.promotion,
    incoming.staging,
    { sources: [incoming.source] }
  );

  assert.equal(plan.summary.already_present, 1);
  assert.equal(plan.summary.additions, 0);
  assert.deepEqual(plan.summary.existing_ids, ['opp_us_existing']);
  assert.equal(plan.preview.total, 1);
});

test('reused stable id with a different event date still fails closed', () => {
  const incoming = annualFixture({ stableId: 'opp_us_stable', date: '2027-09-20', tracking: 'incoming' });
  const existing = {
    ...incoming.promotion.rows[0],
    id: 'opp_us_stable',
    stable_id: 'opp_us_stable',
    source_url: 'https://www.eventeny.com/events/vendor/?id=27624&srsltid=existing',
    application_url: 'https://www.eventeny.com/events/vendor/?id=27624&srsltid=existing',
    event_start: '2026-09-20',
    event_end: '2026-09-20'
  };

  assert.throws(() => planStateProductionSnapshot(
    FL,
    { total: 1, rows: [existing] },
    incoming.promotion,
    incoming.staging,
    { sources: [incoming.source] }
  ), /Florida production identity collision:opp_us_stable/);
});
