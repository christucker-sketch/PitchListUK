function normalise(value) {
  return String(value || '').trim().toLowerCase();
}

function provinceCode(row) {
  const direct = String(row?.region_code || '').trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(direct)) return direct;
  const jurisdiction = String(row?.jurisdiction || '').trim().toUpperCase();
  const match = jurisdiction.match(/^CA-([A-Z]{2})$/);
  return match ? match[1] : '';
}

function searchable(row) {
  return [
    row.event_name,
    row.organiser,
    row.location,
    row.region,
    row.region_name,
    row.region_code,
    row.vendor_categories,
    row.route_type,
    row.notes
  ].join(' ').toLowerCase();
}

function isCanadaRow(row) {
  const code = provinceCode(row);
  return row?.country_code === 'CA'
    && /^[A-Z]{2}$/.test(code)
    && String(row?.jurisdiction || '').toUpperCase() === `CA-${code}`
    && String(row?.currency || '').toUpperCase() === 'CAD';
}

function isCustomerVisibleCanadaRow(row) {
  return isCanadaRow(row)
    && row?.publishable === true
    && String(row?.quality_status || '').toLowerCase() === 'customer_ready';
}

function previewCanadaRow(row) {
  return {
    ...row,
    locked: true,
    source_url: '',
    application_url: '',
    notes: row?.notes ? 'Full source and application route unlock after trial signup.' : ''
  };
}

function searchCanadaCustomerRows(rows = [], options = {}) {
  const fullAccess = Boolean(options.fullAccess);
  const q = normalise(options.q);
  const category = normalise(options.category);
  const province = String(options.province || options.region_code || '').trim().toUpperCase();
  const limit = Math.min(Math.max(Number(options.limit || 75), 1), 250);
  const offset = Math.min(Math.max(Number(options.offset || 0), 0), 10000);

  let filtered = rows
    .filter(isCustomerVisibleCanadaRow)
    .filter(row => !province || provinceCode(row) === province)
    .map(row => ({ ...row, _search: searchable(row) }));

  if (q) filtered = filtered.filter(row => row._search.includes(q));
  if (category) filtered = filtered.filter(row => row._search.includes(category));

  filtered.sort((a, b) => String(a.event_start || '9999-99-99').localeCompare(String(b.event_start || '9999-99-99'))
    || String(a.region_name || a.region || '').localeCompare(String(b.region_name || b.region || ''))
    || String(a.event_name || '').localeCompare(String(b.event_name || '')));

  const total = filtered.length;
  const page = filtered.slice(offset, offset + limit).map(row => {
    const { _search, ...clean } = row;
    return fullAccess ? clean : previewCanadaRow(clean);
  });

  return {
    country_code: 'CA',
    region_code: province || null,
    total,
    offset,
    limit,
    rows: page
  };
}

module.exports = {
  provinceCode,
  isCanadaRow,
  isCustomerVisibleCanadaRow,
  previewCanadaRow,
  searchCanadaCustomerRows
};
