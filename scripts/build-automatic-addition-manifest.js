#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { parseSnapshot, canonicalUrl, atomicWrite } = require('./lib/reviewed-opportunity-publisher');
const { parseCsv } = require('../operations/opportunity-pipeline/scripts/clean-staged-events');
const { stableOpportunityId, duplicateKeys } = require('../operations/opportunity-pipeline/lib/opportunity-safety');
const { sourceRuleFor, termsReviewed } = require('../operations/opportunity-pipeline/config/sources');
const { rowCoordinates } = require('../operations/opportunity-pipeline/lib/geo-radius');

function productionRow(row, today) {
  const coordinates = rowCoordinates({ ...row, county: row.location, notes: row.source_evidence });
  return {
    id: row.stable_id || stableOpportunityId(row), event_name: row.event_name, organiser: row.organiser,
    location: row.location, county: row.region || row.location, region: row.region || row.location,
    event_start: row.event_start || '', event_end: row.event_end || '', application_deadline: row.application_deadline || '',
    stall_fee: row.stall_fee || '', vendor_categories: row.vendor_categories || '', last_checked: row.last_checked || today,
    freshness_status: 'fresh', freshness_age_days: 0, confidence: row.confidence || 'medium',
    quality_status: 'customer_ready', publishable: true, area_confidence: coordinates?.precision === 'place' ? 'exact' : 'region',
    route_type: sourceRuleFor(row.source_url).opportunity_type || 'market',
    organiser_type: sourceRuleFor(row.source_url).type === 'local-authority' ? 'local_council' : 'market_operator',
    country: 'United Kingdom', jurisdiction: 'GB', currency: 'GBP', market_domain: 'pitchlist.uk', tax_region: 'UK',
    buyer_fit_tags: String(row.vendor_categories || '').replace(/;\s*/g, ';'),
    notes: `Automatically staged from a directly fetched, approved first-party source on ${today}.`,
    application_url: row.application_url || row.source_url, source_url: row.source_url,
    ...(coordinates ? { latitude: coordinates.latitude, longitude: coordinates.longitude, coordinate_source: coordinates.source, coordinate_precision: coordinates.precision, coordinate_label: coordinates.label } : {})
  };
}

function buildAutomaticAdditionManifest({ snapshot, rows, directReport, reviewedCommit, today, maxAdditions = 3, maxUpdates = 50 }) {
  if (!reviewedCommit) throw new Error('automatic_manifest_reviewed_commit_required');
  if (directReport?.mode !== 'direct-approved-source-fetch' || directReport.serper_credits_used !== 0) throw new Error('automatic_manifest_direct_fetch_attestation_required');
  const fetched = new Set((directReport.fetched_urls || []).map(canonicalUrl));
  const existingBySource = new Map((snapshot.rows || []).map(row => [canonicalUrl(row.source_url), row]));
  const existingKeys = new Set((snapshot.rows || []).flatMap(row => [...duplicateKeys(row)]));
  const additions = [];
  const updates = [];
  for (const staged of rows) {
    if (staged.quality_status !== 'customer_ready' || String(staged.publishable) !== 'true') continue;
    const rule = sourceRuleFor(staged.source_url);
    if (!rule.approved || !termsReviewed(rule) || canonicalUrl(rule.official_application_route) !== canonicalUrl(staged.source_url)) continue;
    if (!fetched.has(canonicalUrl(staged.source_url)) || !staged.source_evidence || !staged.organiser || !staged.location) continue;
    const existing = existingBySource.get(canonicalUrl(staged.source_url));
    if (existing) {
      updates.push({
        reason: 'automatic_approved_source_identity_refresh_all_quality_gates_passed',
        match_source_url: existing.source_url,
        row: { ...existing, last_checked: today, freshness_status: 'fresh', freshness_age_days: 0, quality_status: 'customer_ready', publishable: true, notes: `Directly revalidated from the approved first-party source on ${today}.` },
        automation_evidence: { source_domain: rule.host, directly_fetched: true, fetched_at: directReport.generated_at, source_evidence_present: true, identity_preserved: true }
      });
      continue;
    }
    const row = productionRow(staged, today);
    const keys = [...duplicateKeys(row)];
    if (keys.some(key => existingKeys.has(key))) continue;
    additions.push({ reason: 'automatic_approved_source_direct_fetch_all_quality_gates_passed', row, automation_evidence: { source_domain: rule.host, directly_fetched: true, fetched_at: directReport.generated_at, source_evidence_present: true } });
    keys.forEach(key => existingKeys.add(key));
  }
  if (additions.length > maxAdditions) throw new Error(`automatic_manifest_addition_limit_exceeded:${additions.length}`);
  if (updates.length > maxUpdates) throw new Error(`automatic_manifest_update_limit_exceeded:${updates.length}`);
  return {
    manifest_version: 1, review_id: `automatic-approved-additions-${today}`,
    created_at: new Date().toISOString(), baseline: { production_count: snapshot.rows.length, production_snapshot_exported_at: snapshot.exported_at },
    approval: { reviewed: true, approved_for_publish: true, reviewed_by: 'PitchList approved-source automation', reviewed_commit: reviewedCommit, mode: 'approved_source_automatic_addition', policy_version: 1 },
    automation: { source_registry_required: true, direct_fetch_required: true, removals_allowed: false, updates_allowed: 'identity_refresh_only', max_additions: maxAdditions, max_updates: maxUpdates },
    changes: { additions, updates, removals: [] }
  };
}

function main() {
  const args = process.argv.slice(2);
  const value = flag => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : ''; };
  const csvArg = value('--customer-ready-csv');
  const reportArg = value('--direct-report');
  const outputArg = value('--output');
  const reviewedCommit = value('--reviewed-commit');
  if (!csvArg || !reportArg || !outputArg || !reviewedCommit) throw new Error('Usage: build-automatic-addition-manifest.js --customer-ready-csv FILE --direct-report FILE --reviewed-commit SHA --output FILE');
  const csvFile = path.resolve(csvArg);
  const reportFile = path.resolve(reportArg);
  const outputFile = path.resolve(outputArg);
  const snapshot = parseSnapshot(fs.readFileSync(path.join(__dirname, '..', 'functions/_data/opportunities.mjs'), 'utf8'));
  const rows = parseCsv(fs.readFileSync(csvFile, 'utf8'));
  const directReport = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  const manifest = buildAutomaticAdditionManifest({ snapshot, rows, directReport, reviewedCommit, today: new Date().toISOString().slice(0, 10), maxAdditions: Number(process.env.PITCHLIST_AUTOMATIC_ADDITION_LIMIT || 3), maxUpdates: Number(process.env.PITCHLIST_AUTOMATIC_UPDATE_LIMIT || 50) });
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  atomicWrite(outputFile, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ outputFile, beforeCount: snapshot.rows.length, additions: manifest.changes.additions.map(item => ({ event_name: item.row.event_name, source_url: item.row.source_url })), updates: manifest.changes.updates.map(item => ({ event_name: item.row.event_name, source_url: item.row.source_url })), afterCount: snapshot.rows.length + manifest.changes.additions.length }, null, 2));
}

if (require.main === module) { try { main(); } catch (error) { console.error(error.message); process.exit(1); } }
module.exports = { productionRow, buildAutomaticAdditionManifest };
