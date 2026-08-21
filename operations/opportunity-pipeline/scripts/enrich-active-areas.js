#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { runtimeRoot } = require('../lib/staging-store');
const { ACTIVE_FIELDNAMES } = require('../acquisition/config');
const { toCsv } = require('../acquisition/csv');
const { parseCsv } = require('../lib/opportunity-database');
const { inferKnownCounty } = require('../lib/geo-normalise');

const APP = runtimeRoot();
const ACTIVE = path.join(APP, 'data/events-active.csv');
const REPORT_DIR = path.join(APP, 'data/enrichment');
const ACTIVE_FIELDS = ACTIVE_FIELDNAMES;

function args(argv) {
  return {
    apply: argv.includes('--apply'),
    dryRun: argv.includes('--dry-run') || !argv.includes('--apply')
  };
}

function needsArea(row) {
  return !String(row.region || '').trim() || /^unknown$/i.test(String(row.region || '').trim())
    || !String(row.location || '').trim() || /^unknown$/i.test(String(row.location || '').trim());
}

function appendNote(notes, note) {
  const existing = String(notes || '').trim();
  return existing ? `${existing} | ${note}` : note;
}

function enrichRow(row, today) {
  if (!needsArea(row)) return { changed: false, row };
  const inferred = inferKnownCounty(
    row.region,
    row.location,
    row.event_name,
    row.organiser,
    row.source_url,
    row.application_url,
    row.notes
  );
  if (inferred === 'Unknown') return { changed: false, row };
  const next = { ...row };
  if (!next.region || /^unknown$/i.test(next.region)) next.region = inferred;
  if (!next.location || /^unknown$/i.test(next.location)) next.location = inferred;
  next.notes = appendNote(next.notes, `Area enrichment ${today}: inferred ${inferred}`);
  return { changed: true, inferred, row: next };
}

function main() {
  const options = args(process.argv.slice(2));
  const today = new Date().toISOString().slice(0, 10);
  const rows = parseCsv(fs.readFileSync(ACTIVE, 'utf8'));
  const enriched = rows.map(row => enrichRow(row, today));
  const changed = enriched.filter(item => item.changed);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const reportPath = path.join(REPORT_DIR, `area-enrichment-${stamp}.json`);
  const report = {
    generated_at: new Date().toISOString(),
    mode: options.apply ? 'apply' : 'dry-run',
    input_rows: rows.length,
    changed: changed.length,
    inferred_counts: changed.reduce((acc, item) => {
      acc[item.inferred] = (acc[item.inferred] || 0) + 1;
      return acc;
    }, {}),
    examples: changed.slice(0, 25).map(item => ({
      event_name: item.row.event_name,
      inferred: item.inferred,
      source_url: item.row.source_url
    })),
    report_file: reportPath
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  if (options.apply && changed.length) {
    const backup = path.join(path.dirname(ACTIVE), `events-active.area-backup-${stamp}.csv`);
    fs.copyFileSync(ACTIVE, backup);
    fs.writeFileSync(ACTIVE, toCsv(enriched.map(item => item.row), ACTIVE_FIELDS));
    report.backup_file = backup;
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  }

  console.log(JSON.stringify({
    mode: report.mode,
    input_rows: report.input_rows,
    changed: report.changed,
    inferred_counts: report.inferred_counts,
    report_file: report.report_file,
    backup_file: report.backup_file || ''
  }, null, 2));
}

main();
