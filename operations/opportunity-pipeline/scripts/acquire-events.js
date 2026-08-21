#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { DEFAULT_QUERIES, FIELDNAMES } = require('../acquisition/config');
const { serperSearch } = require('../acquisition/search');
const { sourceCandidateToRow } = require('../acquisition/extract');
const { toCsv, validateRows } = require('../acquisition/csv');
const { canonicalUrl } = require('../lib/opportunity-safety');
const { preflightFromEnv } = require('../lib/credit-budget');
const { createPolicyFetcher, mapBounded } = require('../lib/fetch-policy');
const { runtimeRoot, atomicWriteJson } = require('../lib/staging-store');

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function uniqByUrl(rows) {
  const seen = new Set();
  return rows.filter(row => {
    const key = canonicalUrl(row.source_url) || `invalid:${String(row.source_url)}:${String(row.event_name)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function emailFromMailto(value) {
  const match = String(value || '').match(/^mailto:([^?]+)/i);
  return match ? decodeURIComponent(match[1]).trim() : '';
}

function sanitiseRow(row) {
  const out = { quality_status: 'review', quality_reasons: 'not_yet_evaluated', publishable: false, ...row };
  if (out.application_url && !/^https?:\/\//.test(out.application_url)) {
    const email = emailFromMailto(out.application_url);
    if (email && !out.contact_email) out.contact_email = email;
    out.application_url = out.source_url;
  }
  return out;
}

function prepareRowsForExport(rows, options = {}) {
  const deduped = uniqByUrl(rows).filter(row => row.event_name && row.source_url).map(sanitiseRow);
  const validationErrors = validateRows(deduped);
  const invalidIndexes = new Set(validationErrors.map(error => error.index));
  return {
    rows: deduped.filter((_, index) => !invalidIndexes.has(index)),
    validationErrors,
    quarantinedRows: validationErrors.map(error => ({ ...error, row: deduped[error.index] })),
    strict: options.strict === true
  };
}

function atomicWriteText(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, value, { mode: 0o600 });
  fs.renameSync(temporary, target);
}

async function main() {
  const argvQueries = process.argv.slice(2);
  const queryLimit = Number(process.env.PITCHLIST_ACQUIRE_QUERY_LIMIT || (argvQueries.length ? 8 : 60));
  const queries = (argvQueries.length ? argvQueries : DEFAULT_QUERIES).slice(0, queryLimit);
  const preflight = preflightFromEnv(queries.length);
  if (!preflight.allowed) throw new Error(`Serper preflight blocked acquisition: ${preflight.reason}`);

  const searchNum = Number(process.env.PITCHLIST_ACQUIRE_SEARCH_NUM || 10);
  const maxFetch = Number(process.env.PITCHLIST_ACQUIRE_MAX_FETCH || 250);
  const concurrency = Math.min(4, Math.max(1, Number(process.env.PITCHLIST_ACQUIRE_CONCURRENCY || 2)));
  const outDir = path.join(runtimeRoot(), 'data', 'staging');
  const today = new Date().toISOString().slice(0, 10);
  const lane = process.env.PITCHLIST_QUERY_LANE || 'manual';
  const candidates = [];
  for (const query of queries) {
    const results = await serperSearch(query, { num: searchNum });
    candidates.push(...results.map(result => ({ ...result, query_lane: lane })));
    await sleep(350);
  }
  const deduped = Array.from(new Map(candidates.map(candidate => [canonicalUrl(candidate.url), candidate])).values()).filter(candidate => candidate.url).slice(0, maxFetch);
  const { fetchWithPolicy } = createPolicyFetcher();
  const outcomes = await mapBounded(deduped, concurrency, async candidate => {
    const result = await fetchWithPolicy(candidate.url);
    if (!result.ok) return { candidate, failure: result.classification, attempts: result.attempts };
    const html = (await result.response.text()).slice(0, 160000);
    const row = sourceCandidateToRow({ ...candidate, url: result.final_url || candidate.url }, html, today);
    return { candidate, row, fetched_at: new Date().toISOString(), html_bytes: html.length, attempts: result.attempts };
  });
  const prepared = prepareRowsForExport(outcomes.filter(item => item.row).map(item => item.row), {
    strict: ['1', 'true', 'yes'].includes(String(process.env.PITCHLIST_ACQUIRE_STRICT_VALIDATION || '').toLowerCase())
  });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const csvPath = path.join(outDir, `events-${stamp}.csv`);
  const jsonPath = path.join(outDir, `events-${stamp}.json`);
  const reportPath = path.join(outDir, `events-${stamp}.report.json`);
  atomicWriteText(csvPath, toCsv(prepared.rows, FIELDNAMES));
  atomicWriteJson(jsonPath, outcomes);
  atomicWriteJson(reportPath, {
    generated_at: new Date().toISOString(), lane, queries, query_limit: queryLimit, search_num: searchNum,
    max_fetch: maxFetch, candidates: deduped.length, rows: prepared.rows.length,
    fetch_failures: outcomes.filter(item => item.failure).reduce((counts, item) => ({ ...counts, [item.failure]: (counts[item.failure] || 0) + 1 }), {}),
    validation_errors: prepared.validationErrors, credit_preflight: preflight,
    production_write_enabled: false
  });
  console.log(JSON.stringify({ csvPath, jsonPath, reportPath, rows: prepared.rows.length, validationErrors: prepared.validationErrors.length, quarantinedRows: prepared.quarantinedRows.length, productionWriteEnabled: false }, null, 2));
  if (!prepared.rows.length || (prepared.strict && prepared.validationErrors.length)) process.exitCode = 2;
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exit(1); });
module.exports = { emailFromMailto, sanitiseRow, prepareRowsForExport };
