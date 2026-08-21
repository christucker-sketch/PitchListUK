#!/usr/bin/env node
const path = require('path');
const { fetchText } = require('../acquisition/fetch-page');
const { runFreshnessEngine } = require('../lib/freshness-engine');
const { runtimeRoot } = require('../lib/staging-store');

const APP = runtimeRoot();

function args(argv) {
  const out = { limit: 10, apply: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply') out.apply = true;
    else if (arg === '--dry-run') out.apply = false;
    else if (arg === '--limit') out.limit = Number(argv[++i] || 10);
    else if (arg === '--county') out.county = argv[++i] || '';
    else if (arg === '--confidence') out.confidence = argv[++i] || '';
    else if (arg === '--id') out.id = argv[++i] || '';
    else if (arg === '--help' || arg === '-h') out.help = true;
  }
  return out;
}

function help() {
  console.log(`Usage: node scripts/recheck-freshness.js [--dry-run|--apply] [--limit 10] [--county "West Yorkshire"] [--confidence high] [--id OPP-00180]

Default mode is --dry-run. Use --apply to update data/events-active.csv.
The engine writes a JSON report to data/freshness/ on every run.`);
}

async function main() {
  const options = args(process.argv.slice(2));
  if (options.help) return help();
  const report = await runFreshnessEngine(APP, { ...options, fetchText });
  console.log(JSON.stringify({
    mode: report.mode,
    selected: report.selected,
    changed: report.changed,
    verified: report.verified,
    expired: report.expired,
    blocked: report.blocked,
    report_file: report.report_file
  }, null, 2));
  if (report.blocked > 0 && report.changed === 0) process.exitCode = 2;
}

main().catch(err => {
  console.error(err.stack || err.message);
  process.exit(1);
});
