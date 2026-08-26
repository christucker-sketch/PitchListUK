#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { parseSnapshot, REQUIRED_HEADERS } = require('./lib/reviewed-opportunity-publisher');

const DEFAULT_MAX_DATASET_AGE_HOURS = 31 * 24;

function alertNotification(report) {
  const alerts = Array.isArray(report?.alerts) ? report.alerts : [];
  const stableAlerts = alerts
    .map(item => ({
      code: String(item.code || ''),
      detail: item.code === 'production_dataset_stale' ? 'over_threshold' : item.detail
    }))
    .sort((a, b) => a.code.localeCompare(b.code));
  return {
    summary: alerts.map(item => `${item.code}=${item.detail}`).join(', '),
    fingerprint: JSON.stringify(stableAlerts)
  };
}

function evaluateOpportunityHealth(input) {
  const now = Date.parse(input.now || new Date().toISOString());
  const rows = input.snapshot.rows || [];
  const alerts = [];
  const add = (code, detail) => alerts.push({ code, detail });
  const ageHours = (now - Date.parse(input.snapshot.exported_at || 0)) / 3600000;
  const foreign = rows.filter(row => row.country !== 'United Kingdom' || !/^GB(?:-|$)/.test(String(row.jurisdiction || '')));
  const expired = rows.filter(row => row.event_end && Date.parse(`${row.event_end}T23:59:59Z`) < now);
  const northEast = rows.filter(row => /County Durham|North East|Tyne and Wear|Northumberland/i.test([row.location, row.county, row.region].join(' '))).length;
  const southYorkshire = rows.filter(row => /South Yorkshire/i.test([row.location, row.county, row.region].join(' '))).length;
  const recentGrowth = (input.receipts || []).filter(receipt => Date.parse(receipt.generated_at || 0) >= now - 7 * 86400000 && Number(receipt.after_count) > Number(receipt.before_count));
  const growth30 = (input.receipts || []).filter(receipt => Date.parse(receipt.generated_at || 0) >= now - 30 * 86400000 && Number(receipt.after_count) > Number(receipt.before_count));
  const netGrowth7 = recentGrowth.reduce((total, receipt) => total + Number(receipt.after_count) - Number(receipt.before_count), 0);
  const netGrowth30 = growth30.reduce((total, receipt) => total + Number(receipt.after_count) - Number(receipt.before_count), 0);
  const sources = Array.isArray(input.sources) ? input.sources : [];
  const candidates = Array.isArray(input.sourceCandidates) ? input.sourceCandidates : [];
  const candidateBacklog = candidates.filter(item => item.approval_status === 'pending').length;
  const awaitingReview = candidates.filter(item => item.approval_status === 'pending' && item.classification === 'manual-review-required').length;
  const zeroYieldSources = sources.filter(item => Number(item.observed_yield?.customer_ready || item.observed_candidate_yield || 0) === 0).length;
  const headers = String(input.headers || '').toLowerCase();

  if (!Number.isFinite(ageHours) || ageHours > Number(input.maxDatasetAgeHours ?? DEFAULT_MAX_DATASET_AGE_HOURS)) add('production_dataset_stale', Math.round(ageHours));
  if (!recentGrowth.length) add('zero_valid_growth_7_days', 0);
  if (Number.isFinite(input.targetProductionListings) && rows.length < input.targetProductionListings) add('production_listing_target_missed', `${rows.length}/${input.targetProductionListings}`);
  if (Number.isFinite(input.targetApprovedSources) && sources.length < input.targetApprovedSources) add('approved_source_target_missed', `${sources.length}/${input.targetApprovedSources}`);
  if (Number.isFinite(input.minNetGrowth7Days) && netGrowth7 < input.minNetGrowth7Days) add('growth_target_missed', `${netGrowth7}/${input.minNetGrowth7Days}`);
  if (foreign.length) add('foreign_contamination', foreign.length);
  if (expired.length) add('expired_production_records', expired.length);
  if (northEast < Number(input.minNorthEast || 12)) add('north_east_coverage_regression', northEast);
  if (southYorkshire < Number(input.minSouthYorkshire || 4)) add('south_yorkshire_coverage_regression', southYorkshire);
  for (const required of REQUIRED_HEADERS) if (!headers.includes(required.toLowerCase())) add('required_security_header_missing', required.split(':')[0]);
  if (!input.cloudflareSha || input.cloudflareSha !== input.expectedSha) add('production_sha_mismatch', `${input.cloudflareSha || 'missing'} != ${input.expectedSha || 'missing'}`);
  if (Number.isFinite(input.serperRemaining) && input.serperRemaining < Number(input.serperReserve || 100)) add('serper_credits_low', input.serperRemaining);

  return {
    healthy: alerts.length === 0,
    alerts,
    metrics: {
      production_count: rows.length,
      dataset_age_hours: Math.round(ageHours * 10) / 10,
      valid_growth_releases_7_days: recentGrowth.length,
      net_additions_7_days: netGrowth7,
      net_additions_30_days: netGrowth30,
      approved_source_count: sources.length,
      candidate_backlog: candidateBacklog,
      candidates_awaiting_review: awaitingReview,
      approved_sources_zero_yield: zeroYieldSources,
      foreign_records: foreign.length,
      expired_records: expired.length,
      north_east_records: northEast,
      south_yorkshire_records: southYorkshire,
      serper_balance_monitored: Number.isFinite(input.serperRemaining)
    }
  };
}

function readReceipts(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).filter(name => /^opportunity-publish-.*\.json$/.test(name)).flatMap(name => {
    try { return [JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'))]; } catch { return []; }
  });
}

async function main() {
  const runtime = process.env.PITCHLIST_PIPELINE_RUNTIME_DIR;
  const expectedSha = process.env.PITCHLIST_EXPECTED_SHA;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!runtime || !path.isAbsolute(runtime) || !expectedSha || !token || !account) throw new Error('opportunity_health_configuration_missing');
  const root = path.resolve(__dirname, '..');
  const snapshot = parseSnapshot(fs.readFileSync(path.join(root, 'functions/_data/opportunities.mjs'), 'utf8'));
  const { APPROVED_SOURCES } = require('../operations/opportunity-pipeline/config/sources');
  const candidatePath = path.join(runtime, 'data', 'source-candidates', 'registry.json');
  const sourceCandidates = fs.existsSync(candidatePath) ? JSON.parse(fs.readFileSync(candidatePath, 'utf8')).records || [] : [];
  const [live, deployments] = await Promise.all([
    fetch('https://pitchlist.uk/', { method: 'HEAD', signal: AbortSignal.timeout(15000) }),
    fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/pitchlistuk/deployments`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) })
  ]);
  if (!live.ok || !deployments.ok) throw new Error('opportunity_health_live_probe_failed');
  const deploymentBody = await deployments.json();
  const production = deploymentBody.result?.find(item => item.environment === 'production');
  const result = evaluateOpportunityHealth({
    snapshot,
    sources: APPROVED_SOURCES,
    sourceCandidates,
    receipts: readReceipts(path.join(runtime, 'data', 'publish-receipts')),
    headers: [...live.headers].map(([key, value]) => `${key}: ${value}`).join('\n'),
    cloudflareSha: production?.deployment_trigger?.metadata?.commit_hash || '',
    expectedSha,
    serperRemaining: process.env.SERPER_CREDITS_REMAINING === undefined ? NaN : Number(process.env.SERPER_CREDITS_REMAINING),
    serperReserve: Number(process.env.PITCHLIST_SERPER_CREDIT_RESERVE || 100),
    minNorthEast: Number(process.env.PITCHLIST_MIN_NORTH_EAST_RECORDS || 12),
    minSouthYorkshire: Number(process.env.PITCHLIST_MIN_SOUTH_YORKSHIRE_RECORDS || 4),
    maxDatasetAgeHours: process.env.PITCHLIST_MAX_DATASET_AGE_HOURS === undefined
      ? DEFAULT_MAX_DATASET_AGE_HOURS
      : Number(process.env.PITCHLIST_MAX_DATASET_AGE_HOURS),
    targetApprovedSources: Number(process.env.PITCHLIST_TARGET_APPROVED_SOURCES || 100),
    targetProductionListings: Number(process.env.PITCHLIST_TARGET_PRODUCTION_LISTINGS || 400),
    minNetGrowth7Days: Number(process.env.PITCHLIST_MIN_NET_GROWTH_7_DAYS || 20)
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.healthy) process.exitCode = 2;
}

if (require.main === module) main().catch(error => { console.error(String(error.message || error).replace(/[^a-z0-9_.,:/ -]+/gi, '')); process.exit(1); });
module.exports = { DEFAULT_MAX_DATASET_AGE_HOURS, alertNotification, evaluateOpportunityHealth, readReceipts };
