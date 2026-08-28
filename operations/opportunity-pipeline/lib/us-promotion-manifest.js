const crypto = require('crypto');

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

function sourceIdFromVerdict(item, sources = []) {
  const direct = item?.source?.id || item?.candidate?.source?.id || item?.candidate?.source_id || '';
  if (direct) return direct;
  const rowId = sourceIdFromRow(item?.row, sources);
  if (rowId) return rowId;
  const url = String(item?.candidate?.url || item?.url || '');
  if (!url) return '';
  return sources.find(source => source.source_url === url || source.application_url === url)?.id || '';
}

function assertTexasPromotionInput(stagingManifest, sources = []) {
  if (!stagingManifest || stagingManifest.country_code !== 'US' || stagingManifest.region_code !== 'TX') {
    throw new Error('Texas promotion requires a US-TX staging manifest');
  }
  if (stagingManifest.staging_only !== true || stagingManifest.automatic_publish !== false || stagingManifest.production_writes !== false) {
    throw new Error('Texas promotion input must originate from staging-only execution');
  }
  if (!Array.isArray(stagingManifest.rows)) throw new Error('Texas promotion input requires rows');
  if (!stagingManifest.rows.length) throw new Error('Texas promotion requires at least one approved reviewed row');

  const ids = stagingManifest.rows.map(row => sourceIdFromRow(row, sources));
  if (ids.some(id => !id)) throw new Error('Texas promotion row does not map to an approved source');
  if (new Set(ids).size !== ids.length) throw new Error('Texas promotion contains duplicate approved-source identities');

  const sourceById = new Map(sources.map(source => [source.id, source]));
  for (const id of ids) {
    const source = sourceById.get(id);
    if (!source || source.status !== 'approved-pilot') throw new Error(`Texas promotion source is not approved: ${id}`);
    if (source.country_code !== 'US' || source.region_code !== 'TX' || source.jurisdiction !== 'US-TX') {
      throw new Error(`Texas promotion source escaped US-TX boundary: ${id}`);
    }
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

function heldSourceIds(stagingManifest, sources = []) {
  const ids = (Array.isArray(stagingManifest?.held) ? stagingManifest.held : [])
    .map(item => sourceIdFromVerdict(item, sources))
    .filter(Boolean);
  return [...new Set(ids)];
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
    schema_version: 2,
    type: 'us-reviewed-promotion',
    country_code: 'US',
    region_code: 'TX',
    jurisdiction: 'US-TX',
    mode: 'addition-only',
    automatic_publish: false,
    production_write_authorized: false,
    expected_additions: rows.length,
    staging_manifest_sha256: stagingHash,
    approved_source_ids: [...sourceIds],
    held_source_ids: heldSourceIds(stagingManifest, sources),
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
  if (manifest?.expected_additions !== rebuilt.expected_additions) throw new Error('Texas promotion count mismatch');
  if (manifest?.staging_manifest_sha256 !== rebuilt.staging_manifest_sha256) throw new Error('Texas staging manifest hash mismatch');
  if (!Array.isArray(manifest?.rows)) throw new Error('Texas promotion manifest rows missing');
  const actualRowsHash = sha256(stableJson(manifest.rows));
  if (manifest?.rows_sha256 !== actualRowsHash) throw new Error('Texas promotion rows hash mismatch');
  if (manifest?.rows_sha256 !== rebuilt.rows_sha256) throw new Error('Texas promotion rows hash mismatch');
  if (stableJson(manifest.rows) !== stableJson(rebuilt.rows)) throw new Error('Texas promotion rows differ from reviewed staging input');
  if (JSON.stringify(manifest.approved_source_ids) !== JSON.stringify(rebuilt.approved_source_ids)) throw new Error('Texas approved-source set mismatch');
  if (JSON.stringify(manifest.held_source_ids || []) !== JSON.stringify(rebuilt.held_source_ids || [])) throw new Error('Texas held-source set mismatch');
  return true;
}

module.exports = {
  stableJson,
  sha256,
  sourceIdFromRow,
  sourceIdFromVerdict,
  assertTexasPromotionInput,
  buildTexasPromotionManifest,
  verifyTexasPromotionManifest
};
