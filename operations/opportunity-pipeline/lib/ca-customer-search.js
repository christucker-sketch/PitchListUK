const CA_REGION_CODES = new Set([
  'AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'ON', 'PE', 'QC', 'SK', 'NT', 'NU', 'YT'
]);

function normalise(value) {
  return String(value || '').trim().toLowerCase();
}

function canonicalRegionCode(value) {
  return String(value || '').trim().toUpperCase().replace(/^CA-/, '');
}

function rowRegionCode(row) {
  const explicit = canonicalRegionCode(row?.region_code || row?.province_code || '');
  if (explicit) return explicit;
  const jurisdiction = String(row?.jurisdiction || '').trim().toUpperCase();
  return /^CA-[A-Z]{2}$/.test(jurisdiction) ? jurisdiction.slice(3) : '';
}

function searchable(row) {
  return [
    row.event_name,
    row.organiser,
    row.location,
    row.locality,
    row.region,
    row.region_name,
    row.region_code,
    row.province,
    row.territory,
    row.vendor_categories,
    row.opportunity_type,
    row.notes
  ].join(' ').toLowerCase();
}

function isCaRow(row) {
  const code = rowRegionCode(row);
  return String(row?.country || '').trim().toLowerCase() === 'canada'
    && CA_REGION_CODES.has(code)
    && String(row?.jurisdiction || '').trim().toUpperCase() === `CA-${code}`
    && String(row?.currency || '').trim().toUpperCase() === 'CAD';
}

function isCustomerVisibleCaRow(row) {
  return isCaRow(row)
    && row?.publishable === true
    && String(row?.quality_status || '').toLowerCase() === 'customer_ready'
    && String(row?.area_confidence || '').toLowerCase() === 'exact';
}

function previewCaRow(row) {
  return {
    ...row,
    locked: true,
    source_url: '',
    application_url: '',
    notes: row?.notes ? 'Full source and application route unlock after trial signup.' : ''
  };
}

function searchCaCustomerRows(rows = [], options = {}) {
  const fullAccess = Boolean(options.fullAccess);
  const q = normalise(options.q);
  const category = normalise(options.category);
  const regionCode = canonicalRegionCode(options.province || options.territory || options.region_code || '');
  const limit = Math.min(Math.max(Number(options.limit || 75), 1), 250);
  const offset = Math.min(Math.max(Number(options.offset || 0), 0), 10000);

  if (regionCode && !CA_REGION_CODES.has(regionCode)) {
    return {
      country_code: 'CA',
      region_code: regionCode,
      total: 0,
      offset,
      limit,
      rows: []
    };
  }

  let filtered = rows
    .filter(isCustomerVisibleCaRow)
    .filter(row => !regionCode || rowRegionCode(row) === regionCode)
    .map(row => ({
      ...row,
      region_code: rowRegionCode(row),
      _search: searchable(row)
    }));

  if (q) filtered = filtered.filter(row => row._search.includes(q));
  if (category) filtered = filtered.filter(row => row._search.includes(category));

  filtered.sort((a, b) => String(a.event_start || '9999-99-99').localeCompare(String(b.event_start || '9999-99-99'))
    || String(a.event_name || '').localeCompare(String(b.event_name || '')));

  const total = filtered.length;
  const page = filtered.slice(offset, offset + limit).map(row => {
    const { _search, ...clean } = row;
    return fullAccess ? clean : previewCaRow(clean);
  });

  return {
    country_code: 'CA',
    region_code: regionCode || null,
    total,
    offset,
    limit,
    rows: page
  };
}

module.exports = {
  CA_REGION_CODES,
  canonicalRegionCode,
  isCaRow,
  isCustomerVisibleCaRow,
  previewCaRow,
  searchCaCustomerRows
};
