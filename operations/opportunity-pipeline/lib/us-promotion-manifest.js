const crypto = require('crypto');

const APPROVED_TEXAS_SOURCE_IDS = Object.freeze([
  'tx-crossroads-community-market-2026',
  'tx-the-colony-food-drink-2026',
  'tx-greenville-farmers-market-2026',
  'tx-flower-mound-fall-festival-2026',
  'tx-state-fair-concessions-2026'
]);
const HELD_TEXAS_SOURCE_IDS = Object.freeze(['tx-frisco-merry-main-street-2026']);

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sourceIdFromRow(row, sources = []) {
  const sourceUrl = String(row?.source_url || '');
  const applicationUrl = String(row?.application_url || '');
  const source = sources.find(item => item.source_url === sourceUrl || item.application_url === applicationUrl);
  return source?.id || '';
}

function assertTexasPromotionInput(stagingManifest, sources = []) {
  if (!stagingManifest || stagingManifest.country_code !== 'US' || stagingManifest.region_code !== 'TX') {
    throw new Error('Texas promotion requires a US-TX staging manifest');
  }
  if (stagingManifest.staging_only !== true || stagingManifest.automatic_publish !== false || stagingManifest.production_writes !== false) {
    throw new Error('Texas promotion input must originate from staging-only execution');
  }
  if (!Array.isArray(stagingManifest.rows)) throw new Error('Texas promotion input requires rows');
  if (stagingManifest.rows.length !== APPROVED_TEXAS_SOURCE_IDS.length) {
    throw new Error(`Texas promotion requires exactly ${APPROVED_TEXAS_SOURCE_IDS.length} approved rows`);
  }

  const ids = stagingManifest.rows.map(row => sourceIdFromRow(row, sources));
  if (ids.some(id => !id)) throw new Error('Texas promotion row does not map to an approved source');
  if (new Set(ids).size !== ids.length) throw new Error('Texas promotion contains duplicate approved-source identities');
  for (const id of ids) {
    if (!APPROVED_TEXAS_SOURCE_IDS.includes(id)) throw new Error(`Texas promotion source is not approved: ${id}`);
    if (HELD_TEXAS_SOURCE_IDS.includes(id)) throw new Error(`Held Texas source may not be promoted: ${id}`);
  }
  for (const row of stagingManifest.rows) {
    if (row.country_code !== 'US' || row.region_code !== 'TX' || row.jurisdiction !== 'US-TX') {
      throw new Error('Texas promotion row escaped US-TX boundary');
    }
    if (row.publishable !== false || String(row.quality_status || '').toLowerCase() !== 'review') {
      throw new Error('Texas promotion input row must still be review-only');
    }
    if (!row.stable_id || !row.event_name || !row.organiser || !row.source_url || !row.application_url) {
      throw new Error('Texas promotion row is missing required reviewed evidence');
    }
  }
  return ids;
}

function buildTexasPromotionManifest(stagingManifest, options = {}) {
  const sources = options.sources || [];
  const sourceIds = assertTexasPromotionInput(stagingManifest, sources);
  const stagingHash = sha256(stableJson(stagingManifest));
  const rows = stagingManifest.rows.map((row, index) => ({
    ...row,
    source_id: sourceIds[index],
    quality_status: 'customer_ready',
    publishable: true,
    market_domain: 'findpitches.com',
    currency: 'USD',
    promotion_source: 'pli-014-reviewed-texas-pilot'
  }));

  const manifest = {
    schema_version: 1,
    type: 'us-reviewed-promotion',
    country_code: 'US',
    region_code: 'TX',
    jurisdiction: 'US-TX',
    mode: 'addition-only',
    automatic_publish: false,
    production_write_authorized: false,
    expected_additions: APPROVED_TEXAS_SOURCE_IDS.length,
    staging_manifest_sha256: stagingHash,
    approved_source_ids: [...APPROVED_TEXAS_SOURCE_IDS],
    held_source_ids: [...HELD_TEXAS_SOURCE_IDS],
    rows
  };
  manifest.rows_sha256 = sha256(stableJson(rows));
  return manifest;
}

function verifyTexasPromotionManifest(manifest, stagingManifest, options = {}) {
  const rebuilt = buildTexasPromotionManifest(stagingManifest, options);
  if (manifest?.type !== 'us-reviewed-promotion') throw new Error('Unexpected Texas promotion manifest type');
  if (manifest?.mode !== 'addition-only') throw new Error('Texas promotion must remain addition-only');
  if (manifest?.automatic_publish !== false || manifest?.production_write_authorized !== false) {
    throw new Error('Texas promotion manifest may not authorize automatic production writes');
  }
  if (manifest?.expected_additions !== APPROVED_TEXAS_SOURCE_IDS.length) throw new Error('Texas promotion count mismatch');
  if (manifest?.staging_manifest_sha256 !== rebuilt.staging_manifest_sha256) throw new Error('Texas staging manifest hash mismatch');
  if (!Array.isArray(manifest?.rows)) throw new Error('Texas promotion manifest rows missing');
  const actualRowsHash = sha256(stableJson(manifest.rows));
  if (manifest?.rows_sha256 !== actualRowsHash) throw new Error('Texas promotion rows hash mismatch');
  if (manifest?.rows_sha256 !== rebuilt.rows_sha256) throw new Error('Texas promotion rows hash mismatch');
  if (stableJson(manifest.rows) !== stableJson(rebuilt.rows)) throw new Error('Texas promotion rows differ from reviewed staging input');
  if (JSON.stringify(manifest.approved_source_ids) !== JSON.stringify(APPROVED_TEXAS_SOURCE_IDS)) throw new Error('Texas approved-source set mismatch');
  return true;
}

module.exports = {
  APPROVED_TEXAS_SOURCE_IDS,
  HELD_TEXAS_SOURCE_IDS,
  stableJson,
  sha256,
  assertTexasPromotionInput,
  buildTexasPromotionManifest,
  verifyTexasPromotionManifest
};
