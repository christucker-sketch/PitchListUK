const { haversineMiles } = require('./geo-radius');
const { TEXAS_ZIP_PREFIXES, TEXAS_PILOT_ZIPS } = require('../config/texas-zip-seed');

function normaliseUsZip(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{5})(?:-\d{4})?$/);
  return match ? match[1] : '';
}

function isTexasZip(value) {
  const zip = normaliseUsZip(value);
  if (!zip) return false;
  return TEXAS_ZIP_PREFIXES.has(zip.slice(0, 3));
}

function normaliseIndexRecord(zip, record) {
  if (!record || typeof record !== 'object') return null;
  const latitude = Number(record.latitude);
  const longitude = Number(record.longitude);
  const stateCode = String(record.state_code || record.stateCode || record.region_code || record.regionCode || '').toUpperCase();
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (stateCode !== 'TX') return null;
  return {
    country_code: 'US',
    postal_code: zip,
    locality: String(record.city || record.locality || '').trim(),
    region_code: 'TX',
    region_name: String(record.state_name || record.region_name || 'Texas').trim() || 'Texas',
    latitude,
    longitude,
    coordinate_source: String(record.coordinate_source || 'offline-zip-index'),
    coordinate_precision: 'postal',
    coordinate_label: `${zip}${record.city || record.locality ? ` ${record.city || record.locality}` : ''}`.trim()
  };
}

function resolveTexasZip(value, options = {}) {
  const zip = normaliseUsZip(value);
  if (!zip || !isTexasZip(zip)) return null;

  const index = options.index || TEXAS_PILOT_ZIPS;
  const record = index[zip];
  return normaliseIndexRecord(zip, record);
}

function distanceFromTexasZip(value, row, options = {}) {
  const origin = resolveTexasZip(value, options);
  if (!origin || !row) return null;
  const latitude = Number(row.latitude);
  const longitude = Number(row.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return haversineMiles(origin, { latitude, longitude });
}

module.exports = {
  normaliseUsZip,
  isTexasZip,
  resolveTexasZip,
  distanceFromTexasZip
};
