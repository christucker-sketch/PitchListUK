const fs = require('fs');
const path = require('path');
const { runtimeRoot } = require('../lib/staging-store');
const { ACTIVE_FIELDNAMES } = require('../acquisition/config');
const { toCsv } = require('../acquisition/csv');
const { stableOpportunityId, canonicalUrl } = require('../lib/opportunity-safety');
const { atomicWriteJson } = require('../lib/staging-store');

const APP = runtimeRoot();
const STAGING = path.join(APP, 'data', 'staging');
const ACTIVE_CSV = path.join(APP, 'data', 'events-active.csv');
const ARCHIVE_JSON = path.join(APP, 'data', 'events-archive.json');
const REPORT_JSON = path.join(APP, 'data', 'events-refresh-report.json');
const ACTIVE_FIELDS = ACTIVE_FIELDNAMES;
const STALE_UNDATED_DAYS = Number(process.env.PITCHLIST_STALE_UNDATED_DAYS || 45);
const EVENT_GRACE_DAYS = Number(process.env.PITCHLIST_EVENT_GRACE_DAYS || 1);

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i+1];
    if (q) {
      if (c === '"' && n === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else {
      if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (c !== '\r') cell += c;
    }
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const header = rows.shift() || [];
  return rows.filter(r => r.some(Boolean)).map(r => Object.fromEntries(header.map((h,i) => [h, r[i] || ''])));
}
function latestCleanCsv() {
  const files = fs.readdirSync(STAGING).filter(f => /^customer-ready-events-.*\.csv$/.test(f)).map(f => path.join(STAGING, f));
  if (!files.length) throw new Error('No customer-ready staging CSV files found; run the review step first');
  return files.sort((a,b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
}
function isoDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0,10);
}
function daysBetween(a, b) {
  return Math.floor((Date.parse(a) - Date.parse(b)) / 86400000);
}
function addDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0,10);
}
function keyFor(row) {
  return row.stable_id || stableOpportunityId(row) || canonicalUrl(row.application_url || row.source_url);
}
function expiryReason(row, today) {
  const end = isoDate(row.event_end);
  const start = isoDate(row.event_start);
  const lastChecked = isoDate(row.last_checked || row.last_seen);
  if (end && addDays(end, EVENT_GRACE_DAYS) < today) return `event_end_passed:${end}`;
  if (!end && start && addDays(start, EVENT_GRACE_DAYS) < today) return `event_start_passed:${start}`;
  if (!end && !start && lastChecked && daysBetween(today, lastChecked) > STALE_UNDATED_DAYS) return `undated_stale:${lastChecked}`;
  return '';
}
function mergeRows(existing, incoming, today) {
  const byKey = new Map();
  for (const row of existing) byKey.set(keyFor(row), { ...row, lifecycle_status: row.lifecycle_status || 'active' });
  let added = 0, updated = 0;
  for (const raw of incoming) {
    const key = keyFor(raw);
    if (!key) continue;
    const old = byKey.get(key);
    const row = { ...raw, first_seen: old?.first_seen || today, last_seen: today, lifecycle_status: 'active' };
    if (old) {
      const oldScore = Number(old.quality_score || 0);
      const newScore = Number(row.quality_score || 0);
      byKey.set(key, { ...old, ...row, quality_score: Math.max(oldScore, newScore) || row.quality_score });
      updated++;
    } else {
      byKey.set(key, row);
      added++;
    }
  }
  return { rows: Array.from(byKey.values()), added, updated };
}
function main() {
  const today = new Date().toISOString().slice(0,10);
  const cleanCsv = process.argv[2] ? path.resolve(process.argv[2]) : latestCleanCsv();
  const incoming = parseCsv(fs.readFileSync(cleanCsv, 'utf8')).filter(row => row.quality_status === 'customer_ready' && String(row.publishable) === 'true');
  const existing = fs.existsSync(ACTIVE_CSV) ? parseCsv(fs.readFileSync(ACTIVE_CSV, 'utf8')) : [];
  const archive = fs.existsSync(ARCHIVE_JSON) ? JSON.parse(fs.readFileSync(ARCHIVE_JSON, 'utf8')) : [];
  const merged = mergeRows(existing, incoming, today);
  const active = [];
  const expiredNow = [];
  for (const row of merged.rows) {
    const reason = expiryReason(row, today);
    if (reason) expiredNow.push({ ...row, lifecycle_status: 'expired', expired_at: today, expiry_reason: reason });
    else active.push({ ...row, lifecycle_status: 'active' });
  }
  active.sort((a,b) => String(a.region || '').localeCompare(String(b.region || '')) || String(a.event_start || '9999').localeCompare(String(b.event_start || '9999')) || String(a.event_name || '').localeCompare(String(b.event_name || '')));
  const activeTemporary = `${ACTIVE_CSV}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(ACTIVE_CSV), { recursive: true });
  fs.writeFileSync(activeTemporary, toCsv(active, ACTIVE_FIELDS), { mode: 0o600 });
  fs.renameSync(activeTemporary, ACTIVE_CSV);
  atomicWriteJson(ARCHIVE_JSON, [...archive, ...expiredNow]);
  const report = {
    generated_at: new Date().toISOString(),
    source_clean_csv: cleanCsv,
    incoming_rows: incoming.length,
    previous_active_rows: existing.length,
    added: merged.added,
    updated: merged.updated,
    active_rows: active.length,
    expired_this_run: expiredNow.length,
    stale_undated_days: STALE_UNDATED_DAYS,
    event_grace_days: EVENT_GRACE_DAYS,
    active_csv: ACTIVE_CSV,
    archive_json: ARCHIVE_JSON,
    expired_examples: expiredNow.slice(0, 10).map(r => ({ event_name: r.event_name, reason: r.expiry_reason, source_url: r.source_url }))
  };
  atomicWriteJson(REPORT_JSON, report);
  console.log(JSON.stringify(report, null, 2));
}
main();
