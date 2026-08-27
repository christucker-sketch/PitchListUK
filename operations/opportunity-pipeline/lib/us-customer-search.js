const { distanceFromTexasZip } = require('./us-zip-geography');

function normalise(value) {
  return String(value || '').trim().toLowerCase();
}

function searchable(row) {
  return [
    row.event_name,
    row.organiser,
    row.location,
    row.locality,
    row.region_name,
    row.vendor_categories,
    row.opportunity_type,
    row.notes
  ].join(' ').toLowerCase();
}

function isUsTexasRow(row) {
  return row?.country_code === 'US' && row?.region_code === 'TX' && String(row?.jurisdiction || '').startsWith('US-TX');
}

function isCustomerVisibleUsRow(row) {
  return isUsTexasRow(row)
    && row?.publishable === true
    && String(row?.quality_status || '').toLowerCase() === 'customer_ready';
}

function previewUsRow(row) {
  return {
    ...row,
    locked: true,
    source_url: '',
    application_url: '',
    notes: row?.notes ? 'Full source and application route unlock after trial signup.' : ''
  };
}

function searchUsCustomerRows(rows = [], options = {}) {
  const fullAccess = Boolean(options.fullAccess);
  const q = normalise(options.q);
  const category = normalise(options.category);
  const zip = String(options.zip || options.postal_code || '').trim();
  const radius = Number(options.radius_miles || options.radius || 0);
  const limit = Math.min(Math.max(Number(options.limit || 75), 1), 250);
  const offset = Math.min(Math.max(Number(options.offset || 0), 0), 10000);

  let filtered = rows
    .filter(isCustomerVisibleUsRow)
    .map(row => {
      const distance = zip ? distanceFromTexasZip(zip, row, { index: options.zipIndex }) : null;
      return {
        ...row,
        distance_miles: distance === null ? null : Math.round(distance * 10) / 10,
        _search: searchable(row)
      };
    });

  if (q) filtered = filtered.filter(row => row._search.includes(q));
  if (category) filtered = filtered.filter(row => row._search.includes(category));
  if (zip && radius > 0) {
    filtered = filtered.filter(row => row.distance_miles !== null && row.distance_miles <= radius);
  }

  filtered.sort((a, b) => {
    if (zip) {
      const ad = a.distance_miles ?? Number.POSITIVE_INFINITY;
      const bd = b.distance_miles ?? Number.POSITIVE_INFINITY;
      if (ad !== bd) return ad - bd;
    }
    return String(a.event_start || '9999-99-99').localeCompare(String(b.event_start || '9999-99-99'))
      || String(a.event_name || '').localeCompare(String(b.event_name || ''));
  });

  const total = filtered.length;
  const page = filtered.slice(offset, offset + limit).map(row => {
    const { _search, ...clean } = row;
    return fullAccess ? clean : previewUsRow(clean);
  });

  return {
    country_code: 'US',
    region_code: 'TX',
    total,
    offset,
    limit,
    rows: page
  };
}

module.exports = {
  isUsTexasRow,
  isCustomerVisibleUsRow,
  previewUsRow,
  searchUsCustomerRows
};
