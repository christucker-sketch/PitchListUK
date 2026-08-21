#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { atomicWrite } = require('./lib/reviewed-opportunity-publisher');

const root = path.resolve(__dirname, '..');
function run(command, args, label, options = {}) {
  const result = spawnSync(command, args, { cwd: root, env: process.env, encoding: 'utf8', maxBuffer: 30 * 1024 * 1024, ...options });
  if (result.error || result.signal || !Number.isInteger(result.status) || result.status !== 0) throw new Error(`${label}_failed`);
  return String(result.stdout || '').trim();
}
function parseJsonOutput(output) {
  try { return JSON.parse(output); } catch {}
  const starts = [...output.matchAll(/(?:^|\n)\{/g)].map(match => match.index + (match[0].startsWith('\n') ? 1 : 0)).reverse();
  for (const start of starts) { try { return JSON.parse(output.slice(start)); } catch {} }
  throw new Error('command_json_output_invalid');
}
function jsonOutput(command, args, label, options) { return parseJsonOutput(run(command, args, label, options)); }
function assertCanonicalMain() {
  run('git', ['fetch', '--quiet', 'origin', 'main'], 'git_fetch');
  const branch = run('git', ['branch', '--show-current'], 'git_branch');
  const head = run('git', ['rev-parse', 'HEAD'], 'git_head');
  const origin = run('git', ['rev-parse', 'origin/main'], 'git_origin_main');
  const dirty = run('git', ['status', '--porcelain'], 'git_status');
  if (branch !== 'main' || head !== origin || dirty) throw new Error('automatic_growth_refused_noncanonical_checkout');
  return head;
}
function main() {
  const runtime = process.env.PITCHLIST_PIPELINE_RUNTIME_DIR;
  if (!runtime || !path.isAbsolute(runtime)) throw new Error('PITCHLIST_PIPELINE_RUNTIME_DIR_required');
  const head = assertCanonicalMain();
  const directArgs = ['operations/opportunity-pipeline/scripts/fetch-approved-sources.js'];
  if (process.argv.includes('--force')) directArgs.push('--force');
  const direct = jsonOutput(process.execPath, directArgs, 'direct_fetch');
  if (!direct.approvedSourcesChecked) {
    console.log(JSON.stringify({ status: 'no_sources_due', head, published: false, serperCreditsUsed: 0 }, null, 2));
    return;
  }
  const review = jsonOutput(process.execPath, ['operations/opportunity-pipeline/scripts/clean-staged-events.js', direct.csvPath], 'quality_review');
  const manifestPath = path.join(runtime, 'data', 'review', `automatic-approved-additions-${Date.now()}.json`);
  const manifest = jsonOutput(process.execPath, ['scripts/build-automatic-addition-manifest.js', '--customer-ready-csv', review.customer_ready_staging_csv, '--direct-report', direct.reportPath, '--reviewed-commit', head, '--output', manifestPath], 'manifest_build');
  const dryRun = jsonOutput(process.execPath, ['scripts/publish-reviewed-opportunities.js', manifestPath, '--dry-run'], 'publisher_dry_run');
  const enabled = String(process.env.PITCHLIST_AUTOMATIC_ADDITIONS_ENABLED || '').toLowerCase() === 'true';
  let publication = null;
  if (dryRun.additions.length && enabled) publication = jsonOutput(process.execPath, ['scripts/publish-reviewed-opportunities.js', manifestPath, '--apply'], 'publisher_apply');
  const report = { generated_at: new Date().toISOString(), head, approved_sources_checked: direct.approvedSourcesChecked, pages_fetched: direct.pagesFetched, customer_ready_rows: review.customer_ready_rows, proposed_additions: manifest.additions, dry_run: dryRun, automatic_additions_enabled: enabled, published: Boolean(publication), publication, serper_credits_used: 0 };
  const reportPath = path.join(runtime, 'data', 'growth', `approved-source-growth-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  atomicWrite(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(String(error.message || error).replace(/[^a-z0-9_.,:/ -]+/gi, '')); process.exit(1); }
}
module.exports = { parseJsonOutput, assertCanonicalMain };
