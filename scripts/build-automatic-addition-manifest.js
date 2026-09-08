#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { parseSnapshot, atomicWrite } = require('./lib/reviewed-opportunity-publisher');
const { parseCsv } = require('../operations/opportunity-pipeline/scripts/clean-staged-events');
const {
  productionRow,
  buildAutomaticAdditionManifest
} = require('../operations/opportunity-pipeline/lib/uk-addition-publication');

function main() {
  const args = process.argv.slice(2);
  const value = flag => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : ''; };
  const csvArg = value('--customer-ready-csv');
  const reportArg = value('--direct-report');
  const outputArg = value('--output');
  const reviewedCommit = value('--reviewed-commit');
  if (!csvArg || !reportArg || !outputArg || !reviewedCommit) {
    throw new Error('Usage: build-automatic-addition-manifest.js --customer-ready-csv FILE --direct-report FILE --reviewed-commit SHA --output FILE');
  }

  const csvFile = path.resolve(csvArg);
  const reportFile = path.resolve(reportArg);
  const outputFile = path.resolve(outputArg);
  const snapshot = parseSnapshot(fs.readFileSync(path.join(__dirname, '..', 'functions/_data/opportunities.mjs'), 'utf8'));
  const rows = parseCsv(fs.readFileSync(csvFile, 'utf8'));
  const directReport = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  const manifest = buildAutomaticAdditionManifest({
    snapshot,
    rows,
    directReport,
    reviewedCommit,
    today: new Date().toISOString().slice(0, 10),
    maxAdditions: Number(process.env.PITCHLIST_AUTOMATIC_ADDITION_LIMIT || 50),
    maxGrowthPercent: Number(process.env.PITCHLIST_AUTOMATIC_MAX_GROWTH_PERCENT || 25),
    maxPerSource: Number(process.env.PITCHLIST_AUTOMATIC_MAX_PER_SOURCE || 1),
    maxDuplicateRate: Number(process.env.PITCHLIST_AUTOMATIC_MAX_DUPLICATE_RATE || 60)
  });
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  atomicWrite(outputFile, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({
    outputFile,
    beforeCount: snapshot.rows.length,
    additions: manifest.changes.additions.map(item => ({ event_name: item.row.event_name, source_url: item.row.source_url })),
    updates: manifest.changes.updates.map(item => ({ event_name: item.row.event_name, source_url: item.row.source_url })),
    afterCount: snapshot.rows.length + manifest.changes.additions.length
  }, null, 2));
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exit(1); }
}

module.exports = { productionRow, buildAutomaticAdditionManifest };
