const test = require('node:test');
const assert = require('node:assert/strict');

const {
  APPROVED_TEXAS_SOURCE_IDS,
  HELD_TEXAS_SOURCE_IDS,
  buildTexasPromotionManifest,
  verifyTexasPromotionManifest
} = require('../lib/us-promotion-manifest');

const sources = APPROVED_TEXAS_SOURCE_IDS.map((id, index) => ({
  id,
  source_url: `https://example.org/source-${index + 1}`,
  application_url: `https://example.org/apply-${index + 1}`
})).concat(HELD_TEXAS_SOURCE_IDS.map((id, index) => ({
  id,
  source_url: `https://example.org/held-${index + 1}`,
  application_url: `https://example.org/held-${index + 1}`
})));

function stagingRow(index) {
  return {
    stable_id: `opp_us_test_${index + 1}`,
    event_name: `Texas Opportunity ${index + 1}`,
    organiser: `Texas Organiser ${index + 1}`,
    source_url: sources[index].source_url,
    application_url: sources[index].application_url,
    country_code: 'US',
    region_code: 'TX',
    jurisdiction: 'US-TX',
    currency: 'USD',
    quality_status: 'review',
    publishable: false
  };
}

function stagingManifest() {
  return {
    country_code: 'US',
    region_code: 'TX',
    staging_only: true,
    automatic_publish: false,
    production_writes: false,
    rows: APPROVED_TEXAS_SOURCE_IDS.map((_, index) => stagingRow(index))
  };
}

test('Texas promotion manifest converts exactly nine reviewed rows to customer-ready additions', () => {
  const manifest = buildTexasPromotionManifest(stagingManifest(), { sources });
  assert.equal(manifest.expected_additions, 9);
  assert.equal(manifest.rows.length, 9);
  assert.equal(manifest.mode, 'addition-only');
  assert.equal(manifest.automatic_publish, false);
  assert.equal(manifest.production_write_authorized, false);
  assert.deepEqual(manifest.approved_source_ids, APPROVED_TEXAS_SOURCE_IDS);
  assert.deepEqual(manifest.held_source_ids, HELD_TEXAS_SOURCE_IDS);
  assert.ok(manifest.rows.every(row => row.publishable === true));
  assert.ok(manifest.rows.every(row => row.quality_status === 'customer_ready'));
  assert.ok(manifest.rows.every(row => row.market_domain === 'findpitches.com'));
});

test('held Texas sources cannot enter the Texas promotion manifest', () => {
  for (const heldIndex of HELD_TEXAS_SOURCE_IDS.keys()) {
    const input = stagingManifest();
    const heldSource = sources[APPROVED_TEXAS_SOURCE_IDS.length + heldIndex];
    input.rows[input.rows.length - 1] = {
      ...input.rows[input.rows.length - 1],
      source_url: heldSource.source_url,
      application_url: heldSource.application_url
    };
    assert.throws(() => buildTexasPromotionManifest(input, { sources }), /not approved|Held Texas source/);
  }
});

test('Texas promotion fails closed on country contamination or premature publishable rows', () => {
  const contaminated = stagingManifest();
  contaminated.rows[0].country_code = 'GB';
  assert.throws(() => buildTexasPromotionManifest(contaminated, { sources }), /US-TX boundary/);

  const premature = stagingManifest();
  premature.rows[0].publishable = true;
  assert.throws(() => buildTexasPromotionManifest(premature, { sources }), /review-only/);
});

test('promotion manifest is hash-bound to the exact staging manifest and exact row set', () => {
  const input = stagingManifest();
  const manifest = buildTexasPromotionManifest(input, { sources });
  assert.equal(verifyTexasPromotionManifest(manifest, input, { sources }), true);

  const changedInput = stagingManifest();
  changedInput.rows[0].event_name = 'Changed after review';
  assert.throws(() => verifyTexasPromotionManifest(manifest, changedInput, { sources }), /hash mismatch/);

  const changedManifest = JSON.parse(JSON.stringify(manifest));
  changedManifest.rows[0].event_name = 'Tampered promotion row';
  assert.throws(() => verifyTexasPromotionManifest(changedManifest, input, { sources }), /rows hash mismatch/);
});
