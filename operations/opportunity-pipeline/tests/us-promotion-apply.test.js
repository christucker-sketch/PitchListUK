'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  APPROVED_TEXAS_SOURCE_IDS,
  HELD_TEXAS_SOURCE_IDS,
  buildTexasPromotionManifest
} = require('../lib/us-promotion-manifest');
const { planTexasProductionSnapshot } = require('../lib/us-promotion-apply');

const allSourceIds = [...APPROVED_TEXAS_SOURCE_IDS, ...HELD_TEXAS_SOURCE_IDS];
const sources = allSourceIds.map((id, index) => ({
  id,
  source_url: `https://a.test/${index + 1}`,
  application_url: `https://apply.test/${index + 1}`
}));

function staging() {
  return {
    country_code: 'US', region_code: 'TX', staging_only: true, automatic_publish: false, production_writes: false,
    rows: APPROVED_TEXAS_SOURCE_IDS.map((_, index) => ({
      stable_id: `opp_us_${index}`, event_name: `Event ${index}`, organiser: `Org ${index}`,
      source_url: sources[index].source_url, application_url: sources[index].application_url,
      country_code: 'US', region_code: 'TX', jurisdiction: 'US-TX', quality_status: 'review', publishable: false
    }))
  };
}

function promotedRow(promotion, index) {
  return { ...promotion.rows[index], id: promotion.rows[index].stable_id };
}

test('Texas production preview appends all verified rows when snapshot is empty', () => {
  const input = staging();
  const promotion = buildTexasPromotionManifest(input, { sources });
  const snapshot = { total: 0, rows: [] };
  const planned = planTexasProductionSnapshot(snapshot, promotion, input, { sources });
  assert.equal(planned.summary.before_count, 0);
  assert.equal(planned.summary.after_count, APPROVED_TEXAS_SOURCE_IDS.length);
  assert.equal(planned.summary.reviewed_rows, APPROVED_TEXAS_SOURCE_IDS.length);
  assert.equal(planned.summary.already_present, 0);
  assert.equal(planned.summary.additions, APPROVED_TEXAS_SOURCE_IDS.length);
  assert.equal(planned.summary.production_write_authorized, false);
  assert.equal(planned.summary.deploy_authorized, false);
});

test('Texas production preview skips exact existing reviewed identities and adds only net-new rows', () => {
  const input = staging();
  const promotion = buildTexasPromotionManifest(input, { sources });
  const snapshot = { total: 5, rows: promotion.rows.slice(0, 5).map((_, index) => promotedRow(promotion, index)) };
  const planned = planTexasProductionSnapshot(snapshot, promotion, input, { sources });
  assert.equal(planned.summary.before_count, 5);
  assert.equal(planned.summary.already_present, 5);
  assert.equal(planned.summary.additions, APPROVED_TEXAS_SOURCE_IDS.length - 5);
  assert.equal(planned.summary.after_count, APPROVED_TEXAS_SOURCE_IDS.length);
  assert.equal(planned.summary.existing_ids.length, 5);
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
