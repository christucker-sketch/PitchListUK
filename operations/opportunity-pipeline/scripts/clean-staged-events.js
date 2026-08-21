#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { FIELDNAMES } = require('../acquisition/config');
const { toCsv } = require('../acquisition/csv');
const { evaluateOpportunity, mergeDuplicates, customerReadyOnly } = require('../lib/opportunity-safety');
const { runtimeRoot, atomicWriteJson } = require('../lib/staging-store');

function parseCsv(text) {
  const records = [];
  let row = [], cell = '', quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index], next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') { cell += '"'; index++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell); cell = ''; }
    else if (char === '\n') { row.push(cell); records.push(row); row = []; cell = ''; }
    else if (char !== '\r') cell += char;
  }
  if (cell || row.length) { row.push(cell); records.push(row); }
  const header = records.shift() || [];
  return records.filter(record => record.some(Boolean)).map(record => Object.fromEntries(header.map((field, index) => [field, record[index] || ''])));
}

function reviewRows(rows, options = {}) {
  const reviewed = rows.map(row => evaluateOpportunity(row, options));
  const deduped = mergeDuplicates(reviewed);
  const statusCounts = deduped.reduce((counts, row) => ({ ...counts, [row.quality_status]: (counts[row.quality_status] || 0) + 1 }), {});
  return { reviewed: deduped, customerReady: customerReadyOnly(deduped), statusCounts };
}

function atomicWriteText(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, value, { mode: 0o600 });
  fs.renameSync(temporary, target);
}

function main() {
  const staging = path.join(runtimeRoot(), 'data', 'staging');
  const csvPath = process.argv[2] ? path.resolve(process.argv[2]) : fs.readdirSync(staging).filter(name => /^events-.*\.csv$/.test(name)).map(name => path.join(staging, name)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  if (!csvPath) throw new Error('No staged events CSV files found');
  const result = reviewRows(parseCsv(fs.readFileSync(csvPath, 'utf8')));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reviewPath = path.join(staging, `reviewed-events-${stamp}.json`);
  const customerReadyPath = path.join(staging, `customer-ready-events-${stamp}.csv`);
  atomicWriteJson(reviewPath, { source: csvPath, records: result.reviewed, production_write_enabled: false });
  atomicWriteText(customerReadyPath, toCsv(result.customerReady, FIELDNAMES));
  const report = {
    generated_at: new Date().toISOString(), source: csvPath, input_rows: result.reviewed.length,
    status_counts: result.statusCounts, customer_ready_rows: result.customerReady.length,
    reviewed_manifest: reviewPath, customer_ready_staging_csv: customerReadyPath,
    output_csv: customerReadyPath, output_json: reviewPath, production_write_enabled: false
  };
  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exit(1); }
}
module.exports = { parseCsv, reviewRows };
