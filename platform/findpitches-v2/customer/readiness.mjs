// Customer-facing projection contract for FindPitches v2.
// This is deliberately separate from acquisition/classifier candidate state.

export const CUSTOMER_READY_SCHEMA_VERSION = '2026-09-26.1';

export const CUSTOMER_READY_REQUIRED_FIELDS = Object.freeze([
  'id',
  'market',
  'title',
  'region_code',
  'canonical_url',
  'application_url',
  'last_checked'
]);

export const CUSTOMER_READY_ENRICHMENT_FIELDS = Object.freeze([
  'organiser',
  'location',
  'coordinates',
  'event_start',
  'event_end',
  'application_deadline',
  'sells',
  'recurring',
  'description'
]);

export function assessCustomerReadiness(record = {}) {
  const missing = [];
  const invalid = [];

  for (const field of CUSTOMER_READY_REQUIRED_FIELDS) {
    if (!present(record[field])) missing.push(field);
  }

  for (const field of ['canonical_url', 'application_url']) {
    if (present(record[field]) && !httpUrl(record[field])) invalid.push(field);
  }

  if (record.coordinates != null) {
    const lat = Number(record.coordinates?.lat);
    const lng = Number(record.coordinates?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      invalid.push('coordinates');
    }
  }

  if (record.recurring != null && typeof record.recurring !== 'boolean') invalid.push('recurring');
  if (record.sells != null && !Array.isArray(record.sells)) invalid.push('sells');

  return Object.freeze({
    schema_version: CUSTOMER_READY_SCHEMA_VERSION,
    ready: missing.length === 0 && invalid.length === 0,
    missing: Object.freeze(missing),
    invalid: Object.freeze(invalid)
  });
}

function present(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function httpUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
