#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { parseSnapshot, REQUIRED_HEADERS } = require('./lib/reviewed-opportunity-publisher');

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
  const headers = String(input.headers || '').toLowerCase();

  if (!Number.isFinite(ageHours) || ageHours > Number(input.maxDatasetAgeHours || 72)) add('production_dataset_stale', Math.round(ageHours));
  if (!recentGrowth.length) add('zero_valid_growth_7_days', 0);
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
  const [live, deployments] = await Promise.all([
    fetch('https://pitchlist.uk/', { method: 'HEAD', signal: AbortSignal.timeout(15000) }),
    fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/pitchlistuk/deployments`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) })
  ]);
  if (!live.ok || !deployments.ok) throw new Error('opportunity_health_live_probe_failed');
  const deploymentBody = await deployments.json();
  const production = deploymentBody.result?.find(item => item.environment === 'production');
  const result = evaluateOpportunityHealth({
    snapshot,
    receipts: readReceipts(path.join(runtime, 'data', 'publish-receipts')),
    headers: [...live.headers].map(([key, value]) => `${key}: ${value}`).join('\n'),
    cloudflareSha: production?.deployment_trigger?.metadata?.commit_hash || '',
    expectedSha,
    serperRemaining: process.env.SERPER_CREDITS_REMAINING === undefined ? NaN : Number(process.env.SERPER_CREDITS_REMAINING),
    serperReserve: Number(process.env.PITCHLIST_SERPER_CREDIT_RESERVE || 100),
    minNorthEast: Number(process.env.PITCHLIST_MIN_NORTH_EAST_RECORDS || 12),
    minSouthYorkshire: Number(process.env.PITCHLIST_MIN_SOUTH_YORKSHIRE_RECORDS || 4)
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.healthy) process.exitCode = 2;
}

if (require.main === module) main().catch(error => { console.error(String(error.message || error).replace(/[^a-z0-9_.,:/ -]+/gi, '')); process.exit(1); });
module.exports = { evaluateOpportunityHealth, readReceipts };
