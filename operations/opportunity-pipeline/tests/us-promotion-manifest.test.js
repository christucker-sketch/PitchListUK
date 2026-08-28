const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildTexasPromotionManifest,
  verifyTexasPromotionManifest
} = require('../lib/us-promotion-manifest');

const sources = [
  { id: 'tx-a', source_url: 'https://example.org/a', application_url: 'https://example.org/apply-a', status: 'approved-pilot', country_code: 'US', region_code: 'TX', jurisdiction: 'US-TX' },
  { id: 'tx-b', source_url: 'https://example.org/b', application_url: 'https://example.org/apply-b', status: 'approved-pilot', country_code: 'US', region_code: 'TX', jurisdiction: 'US-TX' },
  { id: 'tx-c', source_url: 'https://example.org/c', application_url: 'https://example.org/apply-c', status: 'approved-pilot', country_code: 'US', region_code: 'TX', jurisdiction: 'US-TX' },
  { id: 'tx-held', source_url: 'https://example.org/held', application_url: 'https://example.org/held', status: 'approved-pilot', country_code: 'US', region_code: 'TX', jurisdiction: 'US-TX' }
];

function stagingRow(source, index) {
  return {
    stable_id: `opp_us_test_${index + 1}`,
    event_name: `Texas Opportunity ${index + 1}`,
    organiser: `Texas Organiser ${index + 1}`,
    source_url: source.source_url,
    application_url: source.application_url,
    country_code: 'US',
    region_code: 'TX',
    jurisdiction: 'US-TX',
    currency: 'USD',
    quality_status: 'review',
    publishable: false
  };
}

function stagingManifest(count = 3) {
  return {
    country_code: 'US',
    region_code: 'TX',
    staging_only: true,
    automatic_publish: false,
    production_writes: false,
    rows: sources.slice(0, count).map((source, index) => stagingRow(source, index)),
    held: [{ source: sources[3], reason: 'missing_event_date' }]
  };
}

test('Texas promotion manifest derives approved row count and source set from reviewed staging output', () => {
  const input = stagingManifest(3);
  const manifest = buildTexasPromotionManifest(input, { sources });
  assert.equal(manifest.schema_version, 2);
  assert.equal(manifest.expected_additions, 3);
  assert.equal(manifest.rows.length, 3);
  assert.equal(manifest.mode, 'addition-only');
  assert.equal(manifest.automatic_publish, false);
  assert.equal(manifest.production_write_authorized, false);
  assert.deepEqual(manifest.approved_source_ids, ['tx-a', 'tx-b', 'tx-c']);
  assert.deepEqual(manifest.held_source_ids, ['tx-held']);
  assert.ok(manifest.rows.every(row => row.publishable === true));
  assert.ok(manifest.rows.every(row => row.quality_status === 'customer_ready'));
  assert.ok(manifest.rows.every(row => row.market_domain === 'findpitches.com'));
});

test('Texas promotion can grow to a different reviewed row count without a code change', () => {
  const extra = { id: 'tx-d', source_url: 'https://example.org/d', application_url: 'https://example.org/apply-d', status: 'approved-pilot', country_code: 'US', region_code: 'TX', jurisdiction: 'US-TX' };
  const expandedSources = [...sources, extra];
  const input = stagingManifest(3);
  input.rows.push(stagingRow(extra, 3));
  const manifest = buildTexasPromotionManifest(input, { sources: expandedSources });
  assert.equal(manifest.expected_additions, 4);
  assert.deepEqual(manifest.approved_source_ids, ['tx-a', 'tx-b', 'tx-c', 'tx-d']);
});

test('Texas promotion rejects held or unapproved sources unless staging has actually approved them', () => {
  const input = stagingManifest(3);
  input.rows[2] = stagingRow({ ...sources[3], status: 'held' }, 2);
  const heldSources = sources.map(source => source.id === 'tx-held' ? { ...source, status: 'held' } : source);
  assert.throws(() => buildTexasPromotionManifest(input, { sources: heldSources }), /not approved/);
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
