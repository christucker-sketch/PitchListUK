#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { runtimeRoot } = require('../lib/staging-store');
const { ACTIVE_FIELDNAMES } = require('../acquisition/config');
const { toCsv } = require('../acquisition/csv');
const { parseCsv } = require('../lib/opportunity-database');
const { enrichQuality } = require('../lib/quality-enrichment');

const APP = runtimeRoot();
const ACTIVE = path.join(APP, 'data/events-active.csv');
const REPORT_DIR = path.join(APP, 'data/enrichment');

function parseArgs(argv) {
  return {
    apply: argv.includes('--apply'),
    dryRun: argv.includes('--dry-run') || !argv.includes('--apply')
  };
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = row[key] || '(blank)';
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function summarizeChanges(results) {
  return results.reduce((acc, result) => {
    if (!result.changed) return acc;
    const before = result.before;
    const after = result.row;
    for (const field of ['region', 'location', 'area_confidence', 'route_type', 'organiser_type', 'buyer_fit_tags', 'country', 'jurisdiction', 'currency', 'market_domain', 'tax_region', 'confidence', 'quality_status']) {
      if (String(before[field] || '') !== String(after[field] || '')) {
        acc[field] = (acc[field] || 0) + 1;
      }
    }
    return acc;
  }, {});
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const rows = parseCsv(fs.readFileSync(ACTIVE, 'utf8'));
  const results = rows.map(row => ({ before: row, ...enrichQuality(row) }));
  const changed = results.filter(result => result.changed);
  const nextRows = results.map(result => result.row);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const reportPath = path.join(REPORT_DIR, `quality-enrichment-${stamp}.json`);
  const report = {
    generated_at: new Date().toISOString(),
    mode: options.apply ? 'apply' : 'dry-run',
    input_rows: rows.length,
    changed: changed.length,
    changed_fields: summarizeChanges(results),
    before: {
      confidence: countBy(rows, 'confidence'),
      area_confidence: countBy(rows, 'area_confidence'),
      route_type: countBy(rows, 'route_type'),
      organiser_type: countBy(rows, 'organiser_type'),
      country: countBy(rows, 'country'),
      jurisdiction: countBy(rows, 'jurisdiction'),
      currency: countBy(rows, 'currency'),
      market_domain: countBy(rows, 'market_domain'),
      quality_status: countBy(rows, 'quality_status')
    },
    after: {
      confidence: countBy(nextRows, 'confidence'),
      area_confidence: countBy(nextRows, 'area_confidence'),
      route_type: countBy(nextRows, 'route_type'),
      organiser_type: countBy(nextRows, 'organiser_type'),
      country: countBy(nextRows, 'country'),
      jurisdiction: countBy(nextRows, 'jurisdiction'),
      currency: countBy(nextRows, 'currency'),
      market_domain: countBy(nextRows, 'market_domain'),
      quality_status: countBy(nextRows, 'quality_status')
    },
    examples: changed.slice(0, 30).map(result => ({
      event_name: result.row.event_name,
      before_region: result.before.region || '',
      after_region: result.row.region || '',
      area_confidence: result.row.area_confidence,
      route_type: result.row.route_type,
      organiser_type: result.row.organiser_type,
      buyer_fit_tags: result.row.buyer_fit_tags,
      country: result.row.country,
      jurisdiction: result.row.jurisdiction,
      currency: result.row.currency,
      market_domain: result.row.market_domain,
      before_confidence: result.before.confidence,
      after_confidence: result.row.confidence,
      quality_status: result.row.quality_status,
      source_url: result.row.source_url
    })),
    report_file: reportPath
  };

  if (options.apply && changed.length) {
    const backup = path.join(path.dirname(ACTIVE), `events-active.quality-backup-${stamp}.csv`);
    fs.copyFileSync(ACTIVE, backup);
    fs.writeFileSync(ACTIVE, toCsv(nextRows, ACTIVE_FIELDNAMES));
    report.backup_file = backup;
  }

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    mode: report.mode,
    input_rows: report.input_rows,
    changed: report.changed,
    changed_fields: report.changed_fields,
    before: report.before,
    after: report.after,
    report_file: report.report_file,
    backup_file: report.backup_file || ''
  }, null, 2));
}

main();
