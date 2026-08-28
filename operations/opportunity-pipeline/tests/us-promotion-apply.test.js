'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTexasPromotionManifest } = require('../lib/us-promotion-manifest');
const { planTexasProductionSnapshot } = require('../lib/us-promotion-apply');

const sources = Array.from({ length: 4 }, (_, index) => ({
  id: `tx-${index + 1}`,
  source_url: `https://a.test/${index + 1}`,
  application_url: `https://apply.test/${index + 1}`,
  status: 'approved-pilot',
  country_code: 'US',
  region_code: 'TX',
  jurisdiction: 'US-TX'
}));

function staging(count = 4) {
  return {
    country_code: 'US', region_code: 'TX', staging_only: true, automatic_publish: false, production_writes: false,
    rows: sources.slice(0, count).map((source, index) => ({
      stable_id: `opp_us_${index}`, event_name: `Event ${index}`, organiser: `Org ${index}`,
      source_url: source.source_url, application_url: source.application_url,
      country_code: 'US', region_code: 'TX', jurisdiction: 'US-TX', quality_status: 'review', publishable: false
    }))
  };
}

function promotedRow(promotion, index) {
  return { ...promotion.rows[index], id: promotion.rows[index].stable_id };
}

test('Texas production preview appends all verified rows when snapshot is empty', () => {
  const input = staging(4);
  const promotion = buildTexasPromotionManifest(input, { sources });
  const snapshot = { total: 0, rows: [] };
  const planned = planTexasProductionSnapshot(snapshot, promotion, input, { sources });
  assert.equal(planned.summary.before_count, 0);
  assert.equal(planned.summary.after_count, 4);
  assert.equal(planned.summary.reviewed_rows, 4);
  assert.equal(planned.summary.already_present, 0);
  assert.equal(planned.summary.additions, 4);
  assert.equal(planned.summary.production_write_authorized, false);
  assert.equal(planned.summary.deploy_authorized, false);
});

test('Texas production preview accepts a different reviewed row count without code changes', () => {
  const input = staging(3);
  const promotion = buildTexasPromotionManifest(input, { sources });
  const planned = planTexasProductionSnapshot({ total: 0, rows: [] }, promotion, input, { sources });
  assert.equal(planned.summary.reviewed_rows, 3);
  assert.equal(planned.summary.additions, 3);
  assert.equal(planned.summary.after_count, 3);
});

test('Texas production preview skips exact existing reviewed identities and adds only net-new rows', () => {
  const input = staging(4);
  const promotion = buildTexasPromotionManifest(input, { sources });
  const snapshot = { total: 2, rows: promotion.rows.slice(0, 2).map((_, index) => promotedRow(promotion, index)) };
  const planned = planTexasProductionSnapshot(snapshot, promotion, input, { sources });
  assert.equal(planned.summary.before_count, 2);
  assert.equal(planned.summary.already_present, 2);
  assert.equal(planned.summary.additions, 2);
  assert.equal(planned.summary.after_count, 4);
  assert.equal(planned.summary.existing_ids.length, 2);
});

test('Texas production preview rejects partial identity collisions instead of silently skipping them', () => {
  const input = staging();
  const promotion = buildTexasPromotionManifest(input, { sources });
  const snapshot = { rows: [{
    ...promotedRow(promotion, 0),
    id: 'different-id',
    stable_id: 'different-id'
  }] };
  assert.throws(() => planTexasProductionSnapshot(snapshot, promotion, input, { sources }), /identity collision/);
});

test('Texas production preview rejects duplicate identities within the new candidate set', () => {
  const input = staging();
  const promotion = buildTexasPromotionManifest(input, { sources });
  promotion.rows[1].source_url = promotion.rows[0].source_url;
  promotion.rows_sha256 = 'tampered';
  assert.throws(() => planTexasProductionSnapshot({ rows: [] }, promotion, input, { sources }), /rows hash mismatch/);
});

test('Texas production preview rejects tampered promotion rows before snapshot planning', () => {
  const input = staging();
  const promotion = buildTexasPromotionManifest(input, { sources });
  promotion.rows[0].event_name = 'Tampered';
  assert.throws(() => planTexasProductionSnapshot({ rows: [] }, promotion, input, { sources }), /rows hash mismatch/);
});
