const fs = require('fs');
const path = require('path');
const { ACTIVE_FIELDNAMES } = require('../acquisition/config');
const { toCsv } = require('../acquisition/csv');
const { cleanHtml } = require('../acquisition/fetch-page');
const { parseCsv, freshnessReviewQueue } = require('./opportunity-database');

const ACTIVE_FIELDS = ACTIVE_FIELDNAMES;
const RELEVANT = /(trader|stallholder|vendor|exhibitor|caterer|street food|food trader|food vendor|trade stand|concession|mobile catering|apply|application|pitch|booking|market|festival|show|fair)/i;

function activeCsvPath(root) {
  return path.join(root, 'data', 'events-active.csv');
}

function reportDir(root) {
  return path.join(root, 'data', 'freshness');
}

function todayIso(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function isoDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function keyFor(row) {
  const url = String(row.application_url || row.source_url || '').trim().replace(/\/$/, '').toLowerCase();
  const name = String(row.event_name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const loc = String(row.location || row.region || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return url || `${name}|${loc}`;
}

function isExpired(row, today) {
  const end = isoDate(row.event_end);
  const start = isoDate(row.event_start);
  if (end && addDays(end, 1) < today) return `event_end_passed:${end}`;
  if (!end && start && addDays(start, 1) < today) return `event_start_passed:${start}`;
  return '';
}

function appendNote(notes, note) {
  const existing = String(notes || '').trim();
  return existing ? `${existing} | ${note}` : note;
}

function confidenceAfter(row, sourceOk, applicationOk, relevant) {
  if (sourceOk && applicationOk && relevant) return 'high';
  if (sourceOk && relevant) return String(row.confidence || 'medium').toLowerCase() === 'high' ? 'high' : 'medium';
  return String(row.confidence || 'low').toLowerCase() === 'high' ? 'medium' : (row.confidence || 'low');
}

async function verifyRow(row, options) {
  const today = todayIso(options.now);
  const expiredReason = isExpired(row, today);
  if (expiredReason) {
    return {
      key: keyFor(row),
      changed: true,
      status: 'expired',
      reason: expiredReason,
      row: {
        ...row,
        lifecycle_status: 'expired',
        notes: appendNote(row.notes, `Freshness engine ${today}: expired (${expiredReason})`)
      }
    };
  }

  const fetchText = options.fetchText;
  const sourceUrl = row.source_url || row.application_url;
  const applicationUrl = row.application_url || row.source_url;
  const [sourceHtml, applicationHtml] = await Promise.all([
    sourceUrl ? fetchText(sourceUrl) : Promise.resolve(''),
    applicationUrl && applicationUrl !== sourceUrl ? fetchText(applicationUrl) : Promise.resolve('')
  ]);
  const sourceOk = Boolean(sourceHtml);
  const applicationOk = applicationUrl === sourceUrl ? sourceOk : Boolean(applicationHtml);
  const text = cleanHtml(`${sourceHtml || ''} ${applicationHtml || ''}`).slice(0, 12000);
  const relevant = RELEVANT.test(`${row.event_name} ${row.vendor_categories} ${row.notes} ${text}`);

  if (sourceOk && relevant) {
    const nextConfidence = confidenceAfter(row, sourceOk, applicationOk, relevant);
    return {
      key: keyFor(row),
      changed: true,
      status: 'verified',
      source_ok: sourceOk,
      application_ok: applicationOk,
      relevant,
      row: {
        ...row,
        last_checked: today,
        last_seen: today,
        lifecycle_status: 'active',
        confidence: nextConfidence,
        notes: appendNote(row.notes, `Freshness engine ${today}: source reachable${applicationOk ? ', application route reachable' : ', application route needs manual check'}`)
      }
    };
  }

  return {
    key: keyFor(row),
    changed: false,
    status: sourceOk ? 'needs_manual_review' : 'source_unreachable',
    source_ok: sourceOk,
    application_ok: applicationOk,
    relevant,
    row: {
      ...row,
      notes: appendNote(row.notes, `Freshness engine ${today}: ${sourceOk ? 'needs manual relevance review' : 'source unreachable'}`)
    }
  };
}

function selectRows(root, options = {}) {
  const queue = freshnessReviewQueue(root, { limit: options.scanLimit || 250 }, options.now);
  let rows = queue.rows;
  if (options.county) rows = rows.filter(row => String(row.county || '').toLowerCase() === String(options.county).toLowerCase());
  if (options.id) rows = rows.filter(row => row.id === options.id);
  if (options.confidence) rows = rows.filter(row => String(row.confidence || '').toLowerCase() === String(options.confidence).toLowerCase());
  return rows.slice(0, options.limit || 10);
}

async function runFreshnessEngine(root, options = {}) {
  const now = options.now || new Date();
  const today = todayIso(now);
  const dryRun = options.apply !== true;
  const fetchText = options.fetchText;
  if (typeof fetchText !== 'function') throw new Error('fetchText function is required');

  const selected = selectRows(root, { ...options, now });
  const sourcePath = activeCsvPath(root);
  const activeRows = parseCsv(fs.readFileSync(sourcePath, 'utf8'));
  const byKey = new Map(activeRows.map(row => [keyFor(row), row]));
  const results = [];

  for (const row of selected) {
    const result = await verifyRow(row, { ...options, now, fetchText });
    results.push(result);
    if (result.changed && byKey.has(result.key)) byKey.set(result.key, result.row);
  }

  const changed = results.filter(r => r.changed).length;
  const verified = results.filter(r => r.status === 'verified').length;
  const expired = results.filter(r => r.status === 'expired').length;
  const blocked = results.length - changed;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.mkdirSync(reportDir(root), { recursive: true });
  const reportPath = path.join(reportDir(root), `freshness-run-${stamp}.json`);

  if (!dryRun && changed) {
    const backupPath = path.join(path.dirname(sourcePath), `events-active.backup-${stamp}.csv`);
    fs.copyFileSync(sourcePath, backupPath);
    const nextRows = activeRows.map(row => byKey.get(keyFor(row)) || row);
    fs.writeFileSync(sourcePath, toCsv(nextRows, ACTIVE_FIELDS));
  }

  const report = {
    generated_at: new Date().toISOString(),
    mode: dryRun ? 'dry-run' : 'apply',
    selected: selected.length,
    changed,
    verified,
    expired,
    blocked,
    source_file: sourcePath,
    report_file: reportPath,
    rows: results.map(({ row, ...result }) => ({
      ...result,
      event_name: row.event_name,
      source_url: row.source_url,
      application_url: row.application_url,
      confidence: row.confidence,
      lifecycle_status: row.lifecycle_status,
      last_checked: row.last_checked
    }))
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  return report;
}

module.exports = {
  ACTIVE_FIELDS,
  appendNote,
  isExpired,
  keyFor,
  selectRows,
  verifyRow,
  runFreshnessEngine
};
