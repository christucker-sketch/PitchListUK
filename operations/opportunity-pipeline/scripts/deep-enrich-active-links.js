#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { runtimeRoot } = require('../lib/staging-store');
const { ACTIVE_FIELDNAMES } = require('../acquisition/config');
const { toCsv } = require('../acquisition/csv');
const { fetchText, cleanHtml } = require('../acquisition/fetch-page');
const { parseCsv } = require('../lib/opportunity-database');
const { enrichQuality } = require('../lib/quality-enrichment');

const APP = runtimeRoot();
const ACTIVE = path.join(APP, 'data/events-active.csv');
const REPORT_DIR = path.join(APP, 'data/enrichment');

function parseArgs(argv) {
  const out = {
    apply: false,
    limit: Number(process.env.PITCHLIST_DEEP_ENRICH_LIMIT || 0),
    concurrency: Number(process.env.PITCHLIST_DEEP_ENRICH_CONCURRENCY || 4),
    unknownOnly: false
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply') out.apply = true;
    else if (arg === '--dry-run') out.apply = false;
    else if (arg === '--limit') out.limit = Number(argv[++i] || out.limit);
    else if (arg === '--concurrency') out.concurrency = Number(argv[++i] || out.concurrency);
    else if (arg === '--unknown-only') out.unknownOnly = true;
  }
  if (!Number.isFinite(out.concurrency) || out.concurrency < 1) out.concurrency = 4;
  return out;
}

function targetRow(row, options) {
  if (options.unknownOnly) return row.area_confidence === 'unknown';
  return row.area_confidence === 'unknown' || row.quality_status === 'review' || row.quality_status === 'needs_work';
}

function normaliseUrl(value) {
  const text = String(value || '').trim();
  if (!/^https?:\/\//i.test(text)) return '';
  return text.replace(/#.*$/, '').replace(/\/$/, '');
}

function uniqueUrls(rows) {
  const urls = new Set();
  for (const row of rows) {
    const source = normaliseUrl(row.source_url);
    const application = normaliseUrl(row.application_url);
    if (source) urls.add(source);
    if (application) urls.add(application);
  }
  return [...urls];
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      out[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

function titleFromHtml(html) {
  const match = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? cleanHtml(match[1]).slice(0, 180) : '';
}

function mergeReasons(existing, reasons) {
  const out = new Set(String(existing || '').split(/[;,]/).map(v => v.trim()).filter(Boolean));
  for (const reason of reasons.filter(Boolean)) out.add(reason);
  return [...out].sort().join(';');
}

function countBy(rows, field) {
  return rows.reduce((acc, row) => {
    const value = row[field] || '(blank)';
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function textForRow(row, fetched) {
  const source = normaliseUrl(row.source_url);
  const application = normaliseUrl(row.application_url);
  const sourceHit = source ? fetched.get(source) : null;
  const applicationHit = application ? fetched.get(application) : null;
  // Full page bodies are too noisy for cuisine tags; keep deep evidence to
  // page titles and URLs so only strong local/title signals can change rows.
  return [
    sourceHit?.title,
    source,
    applicationHit && applicationHit !== sourceHit ? applicationHit.title : '',
    applicationHit && applicationHit !== sourceHit ? application : ''
  ].filter(Boolean).join(' ').slice(0, 30000);
}

function statusFor(url, fetched) {
  if (!url) return 'missing';
  const hit = fetched.get(normaliseUrl(url));
  if (!hit) return 'not_fetched';
  return hit.ok ? 'ok' : 'failed';
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const rows = parseCsv(fs.readFileSync(ACTIVE, 'utf8'));
  let targets = rows.map((row, index) => ({ row, index })).filter(item => targetRow(item.row, options));
  if (options.limit > 0) targets = targets.slice(0, options.limit);
  const urls = uniqueUrls(targets.map(item => item.row));
  const fetched = new Map();

  await mapLimit(urls, options.concurrency, async url => {
    const html = await fetchText(url, 220000);
    fetched.set(url, {
      url,
      ok: Boolean(html),
      bytes: html.length,
      title: titleFromHtml(html),
      text: cleanHtml(html).slice(0, 30000)
    });
  });

  const nextRows = rows.map(row => ({ ...row }));
  const changed = [];
  for (const target of targets) {
    const before = target.row;
    const sourceStatus = statusFor(before.source_url, fetched);
    const applicationStatus = statusFor(before.application_url, fetched);
    const reasons = [
      sourceStatus === 'ok' ? 'deep_source_ok' : sourceStatus === 'failed' ? 'deep_source_failed' : '',
      applicationStatus === 'ok' ? 'deep_application_ok' : applicationStatus === 'failed' ? 'deep_application_failed' : '',
      'deep_text_checked'
    ];
    const enriched = enrichQuality({
      ...before,
      evidence_text: textForRow(before, fetched),
      quality_reasons: mergeReasons(before.quality_reasons, reasons)
    });
    const after = {
      ...enriched.row,
      quality_reasons: mergeReasons(enriched.row.quality_reasons, reasons)
    };
    const material = ['location', 'region', 'area_confidence', 'route_type', 'organiser_type', 'buyer_fit_tags', 'confidence', 'quality_status', 'quality_score', 'quality_reasons']
      .some(field => String(before[field] || '') !== String(after[field] || ''));
    if (material) {
      nextRows[target.index] = after;
      changed.push({
        index: target.index,
        event_name: after.event_name,
        source_status: sourceStatus,
        application_status: applicationStatus,
        before_area_confidence: before.area_confidence || '',
        after_area_confidence: after.area_confidence || '',
        before_region: before.region || '',
        after_region: after.region || '',
        before_confidence: before.confidence || '',
        after_confidence: after.confidence || '',
        before_quality_status: before.quality_status || '',
        after_quality_status: after.quality_status || '',
        before_organiser_type: before.organiser_type || '',
        after_organiser_type: after.organiser_type || '',
        buyer_fit_tags: after.buyer_fit_tags || '',
        source_url: after.source_url
      });
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const reportPath = path.join(REPORT_DIR, `deep-link-enrichment-${stamp}.json`);
  const report = {
    generated_at: new Date().toISOString(),
    mode: options.apply ? 'apply' : 'dry-run',
    input_rows: rows.length,
    target_rows: targets.length,
    fetched_urls: urls.length,
    fetched_ok: [...fetched.values()].filter(item => item.ok).length,
    fetched_failed: [...fetched.values()].filter(item => !item.ok).length,
    changed: changed.length,
    before: {
      confidence: countBy(rows, 'confidence'),
      area_confidence: countBy(rows, 'area_confidence'),
      organiser_type: countBy(rows, 'organiser_type'),
      quality_status: countBy(rows, 'quality_status')
    },
    after: {
      confidence: countBy(nextRows, 'confidence'),
      area_confidence: countBy(nextRows, 'area_confidence'),
      organiser_type: countBy(nextRows, 'organiser_type'),
      quality_status: countBy(nextRows, 'quality_status')
    },
    changes: changed.slice(0, 100),
    report_file: reportPath
  };

  if (options.apply && changed.length) {
    const backup = path.join(path.dirname(ACTIVE), `events-active.deep-backup-${stamp}.csv`);
    fs.copyFileSync(ACTIVE, backup);
    fs.writeFileSync(ACTIVE, toCsv(nextRows, ACTIVE_FIELDNAMES));
    report.backup_file = backup;
  }

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    mode: report.mode,
    input_rows: report.input_rows,
    target_rows: report.target_rows,
    fetched_urls: report.fetched_urls,
    fetched_ok: report.fetched_ok,
    fetched_failed: report.fetched_failed,
    changed: report.changed,
    before: report.before,
    after: report.after,
    report_file: report.report_file,
    backup_file: report.backup_file || ''
  }, null, 2));
}

main().catch(err => {
  console.error(err.stack || err.message);
  process.exit(1);
});
