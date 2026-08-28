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
