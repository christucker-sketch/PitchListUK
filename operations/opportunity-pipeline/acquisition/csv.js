const { FIELDNAMES } = require('./config');

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
function toCsv(rows, fields = FIELDNAMES) {
  return [fields.join(','), ...rows.map(row => fields.map(f => csvEscape(row[f] || '')).join(','))].join('\n') + '\n';
}
function validateRow(row) {
  const errors = [];
  if (!row.event_name) errors.push('missing event_name');
  if (!/^https?:\/\//.test(row.source_url || '')) errors.push('source_url must be http(s)');
  if (row.application_url && !/^https?:\/\//.test(row.application_url)) errors.push('application_url must be http(s) when present');
  if (!row.last_checked) errors.push('missing last_checked');
  if (!['high','medium','low'].includes(String(row.confidence || '').toLowerCase())) errors.push('confidence must be high/medium/low');
  return errors;
}
function validateRows(rows) {
  return rows.map((row, index) => ({ index, errors: validateRow(row), row })).filter(r => r.errors.length);
}
module.exports = { toCsv, validateRow, validateRows };
