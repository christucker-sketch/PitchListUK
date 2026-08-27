'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTexasPromotionManifest } = require('../lib/us-promotion-manifest');
const { planTexasProductionSnapshot } = require('../lib/us-promotion-apply');

const sources = [
  ['tx-crossroads-community-market-2026','https://a.test/1'],
  ['tx-the-colony-food-drink-2026','https://a.test/2'],
  ['tx-greenville-farmers-market-2026','https://a.test/3'],
  ['tx-flower-mound-fall-festival-2026','https://a.test/4'],
  ['tx-state-fair-concessions-2026','https://a.test/5'],
  ['tx-frisco-merry-main-street-2026','https://a.test/6']
].map(([id,url]) => ({ id, source_url:url, application_url:url }));

function staging() {
  return {
    country_code:'US', region_code:'TX', staging_only:true, automatic_publish:false, production_writes:false,
    rows:sources.slice(0,5).map((source,index) => ({
      stable_id:`opp_us_${index}`, event_name:`Event ${index}`, organiser:`Org ${index}`,
      source_url:source.source_url, application_url:source.application_url,
      country_code:'US', region_code:'TX', jurisdiction:'US-TX', quality_status:'review', publishable:false
    }))
  };
}

test('Texas production preview appends exactly five verified rows without authorizing writes', () => {
  const input = staging();
  const promotion = buildTexasPromotionManifest(input, { sources });
  const snapshot = { total:1, rows:[{ id:'OPP-1', source_url:'https://gb.test/a', application_url:'https://gb.test/a', country_code:'GB' }] };
  const planned = planTexasProductionSnapshot(snapshot, promotion, input, { sources });
  assert.equal(planned.summary.before_count, 1);
  assert.equal(planned.summary.after_count, 6);
  assert.equal(planned.summary.additions, 5);
  assert.equal(planned.summary.production_write_authorized, false);
  assert.equal(planned.summary.deploy_authorized, false);
  assert.equal(planned.preview.rows.filter(row => row.country_code === 'US').length, 5);
});

test('Texas production preview rejects duplicate production source identities', () => {
  const input = staging();
  const promotion = buildTexasPromotionManifest(input, { sources });
  const snapshot = { rows:[{ id:'OPP-1', source_url:'https://a.test/1', application_url:'https://gb.test/a' }] };
  assert.throws(() => planTexasProductionSnapshot(snapshot, promotion, input, { sources }), /source duplicate/);
});

test('Texas production preview rejects tampered promotion rows before snapshot planning', () => {
  const input = staging();
  const promotion = buildTexasPromotionManifest(input, { sources });
  promotion.rows[0].event_name = 'Tampered';
  assert.throws(() => planTexasProductionSnapshot({ rows:[] }, promotion, input, { sources }), /rows hash mismatch/);
});
