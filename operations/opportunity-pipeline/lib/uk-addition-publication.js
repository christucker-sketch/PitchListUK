'use strict';

const crypto = require('node:crypto');
const { stableOpportunityId, duplicateKeys, canonicalUrl } = require('./opportunity-safety');
const { sourceRuleFor, termsReviewed } = require('../config/sources');
const { rowCoordinates } = require('./geo-radius');

function productionRow(row, today) {
  const coordinates = rowCoordinates({ ...row, county: row.location, notes: row.source_evidence });
  return {
    id: row.stable_id || stableOpportunityId(row),
    event_name: row.event_name,
    organiser: row.organiser,
    location: row.location,
    county: row.region || row.location,
    region: row.region || row.location,
    event_start: row.event_start || '',
    event_end: row.event_end || '',
    application_deadline: row.application_deadline || '',
    stall_fee: row.stall_fee || '',
    vendor_categories: row.vendor_categories || '',
    last_checked: row.last_checked || today,
    freshness_status: 'fresh',
    freshness_age_days: 0,
    confidence: row.confidence || 'medium',
    quality_status: 'customer_ready',
    publishable: true,
    area_confidence: coordinates?.precision === 'place' ? 'exact' : 'region',
    route_type: sourceRuleFor(row.source_url).opportunity_type || 'market',
    organiser_type: sourceRuleFor(row.source_url).type === 'local-authority' ? 'local_council' : 'market_operator',
    country: 'United Kingdom',
    jurisdiction: 'GB',
    currency: 'GBP',
    market_domain: 'pitchlist.uk',
    tax_region: 'UK',
    buyer_fit_tags: String(row.vendor_categories || '').replace(/;\s*/g, ';'),
    notes: `Automatically staged from a directly fetched, approved first-party source on ${today}.`,
    application_url: row.application_url || row.source_url,
    source_url: row.source_url,
    ...(coordinates ? {
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      coordinate_source: coordinates.source,
      coordinate_precision: coordinates.precision,
      coordinate_label: coordinates.label
    } : {})
  };
}

function buildAutomaticAdditionManifest({
  snapshot,
  rows,
  directReport,
  reviewedCommit,
  today,
  maxAdditions = 50,
  maxGrowthPercent = 25,
  maxPerSource = 1,
  maxDuplicateRate = 60
}) {
  if (!reviewedCommit) throw new Error('automatic_manifest_reviewed_commit_required');
  if (directReport?.mode !== 'direct-approved-source-fetch' || directReport.serper_credits_used !== 0) {
    throw new Error('automatic_manifest_direct_fetch_attestation_required');
  }
  const fetched = new Set((directReport.fetched_urls || []).map(canonicalUrl));
  const existingBySource = new Map((snapshot.rows || []).map(row => [canonicalUrl(row.source_url), row]));
  const existingKeys = new Set((snapshot.rows || []).flatMap(row => [...duplicateKeys(row)]));
  const additions = [];
  const held = [];
  let eligibleNewRows = 0;
  let duplicateRows = 0;
  const additionsBySource = new Map();

  for (const staged of rows || []) {
    if (staged.quality_status !== 'customer_ready' || String(staged.publishable) !== 'true') continue;
    const rule = sourceRuleFor(staged.source_url);
    if (!rule.approved || !termsReviewed(rule) || canonicalUrl(rule.official_application_route) !== canonicalUrl(staged.source_url)) continue;
    if (!fetched.has(canonicalUrl(staged.source_url)) || !staged.source_evidence || !staged.organiser || !staged.location) continue;

    const existing = existingBySource.get(canonicalUrl(staged.source_url));
    if (existing) {
      held.push({ source_url: staged.source_url, reason: 'existing_route_update_forbidden_by_addition_only_policy' });
      continue;
    }

    const row = productionRow(staged, today);
    eligibleNewRows += 1;
    const keys = [...duplicateKeys(row)];
    if (keys.some(key => existingKeys.has(key))) {
      duplicateRows += 1;
      held.push({ source_url: staged.source_url, reason: 'duplicate_identity_already_in_production' });
      continue;
    }

    const sourceHost = sourceRuleFor(staged.source_url).host;
    const sourceCount = (additionsBySource.get(sourceHost) || 0) + 1;
    if (sourceCount > maxPerSource) throw new Error(`automatic_manifest_per_source_limit_exceeded:${sourceHost}:${sourceCount}`);
    additionsBySource.set(sourceHost, sourceCount);
    additions.push({
      reason: 'automatic_approved_source_direct_fetch_all_quality_gates_passed',
      row,
      automation_evidence: {
        source_domain: rule.host,
        directly_fetched: true,
        fetched_at: directReport.generated_at,
        source_evidence_present: true
      }
    });
    keys.forEach(key => existingKeys.add(key));
  }

  if (additions.length > maxAdditions) throw new Error(`automatic_manifest_addition_limit_exceeded:${additions.length}`);
  const growthPercent = snapshot.rows.length ? additions.length / snapshot.rows.length * 100 : 0;
  if (growthPercent > maxGrowthPercent) throw new Error(`automatic_manifest_growth_percent_exceeded:${growthPercent.toFixed(2)}`);
  const duplicateRate = eligibleNewRows ? duplicateRows / eligibleNewRows * 100 : 0;
  if (additions.length > 0 && duplicateRate > maxDuplicateRate) {
    throw new Error(`automatic_manifest_duplicate_rate_exceeded:${duplicateRate.toFixed(2)}`);
  }

  return {
    manifest_version: 1,
    review_id: `automatic-approved-additions-${today}`,
    created_at: directReport.generated_at || new Date().toISOString(),
    baseline: {
      production_count: snapshot.rows.length,
      production_snapshot_exported_at: snapshot.exported_at
    },
    approval: {
      reviewed: true,
      approved_for_publish: true,
      reviewed_by: 'PitchList approved-source automation',
      reviewed_commit: reviewedCommit,
      mode: 'approved_source_automatic_addition',
      policy_version: 3
    },
    automation: {
      source_registry_required: true,
      direct_fetch_required: true,
      removals_allowed: false,
      updates_allowed: false,
      max_additions: maxAdditions,
      max_updates: 0,
      max_growth_percent: maxGrowthPercent,
      max_per_source: maxPerSource,
      max_duplicate_rate: maxDuplicateRate,
      observed_duplicate_rate: Math.round(duplicateRate * 10) / 10,
      held_existing_routes: held
    },
    changes: { additions, updates: [], removals: [] }
  };
}

function manifestRowsHash(manifest) {
  const rows = (manifest?.changes?.additions || []).map(item => item.row);
  return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

function applyAutomaticAdditionManifest(snapshot, manifest, options = {}) {
  if (!snapshot || !Array.isArray(snapshot.rows)) throw new Error('uk_snapshot_rows_required');
  if (manifest?.changes?.updates?.length) throw new Error('uk_addition_only_updates_forbidden');
  if (manifest?.changes?.removals?.length) throw new Error('uk_addition_only_removals_forbidden');
  if (Number(manifest?.baseline?.production_count) !== snapshot.rows.length) throw new Error('uk_addition_only_baseline_mismatch');

  const additions = (manifest?.changes?.additions || []).map(item => item.row);
  const nextRows = [...snapshot.rows, ...additions];
  const generatedAt = options.generated_at || manifest.created_at || new Date().toISOString();
  const rowsHash = manifestRowsHash(manifest);
  return {
    ...snapshot,
    exported_at: generatedAt,
    source: `global-uk-approved-additions:${rowsHash}`,
    total: nextRows.length,
    rows: nextRows
  };
}

module.exports = {
  productionRow,
  buildAutomaticAdditionManifest,
  applyAutomaticAdditionManifest,
  manifestRowsHash
};
