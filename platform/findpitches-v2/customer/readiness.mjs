// Customer-facing projection contract for FindPitches v2.
// This is deliberately separate from acquisition/classifier candidate state.

export const CUSTOMER_READY_SCHEMA_VERSION = '2026-09-30.practical-location-v1';

export const CUSTOMER_READY_REQUIRED_FIELDS = Object.freeze([
  'id','market','title','region_code','location','location_precision','canonical_url','application_url','last_checked'
]);

export const CUSTOMER_READY_ENRICHMENT_FIELDS = Object.freeze([
  'organiser','coordinates','event_start','event_end','application_deadline',
  'offerings','recurring','description'
]);

const WRAPPER_HOSTS = new Set([
  'google.com','www.google.com','google.co.uk','www.google.co.uk',
  'google.com.hk','www.google.com.hk'
]);
const SOCIAL_HOSTS = new Set([
  'instagram.com','www.instagram.com','facebook.com','www.facebook.com',
  'x.com','www.x.com','twitter.com','www.twitter.com'
]);
const BLOCKED_PATH_TERMS = Object.freeze([
  'procurement','supplier','vendor-registration','vendor_registration','rfp','tender'
]);

export function assessCustomerReadiness(record = {}, { now = new Date() } = {}) {
  const missing = [], invalid = [], blocked = [];
  for (const field of CUSTOMER_READY_REQUIRED_FIELDS) if (!present(record[field])) missing.push(field);
  for (const field of ['canonical_url','application_url']) if (present(record[field]) && !httpUrl(record[field])) invalid.push(field);

  if (present(record.location_precision) && !['venue','place','area'].includes(String(record.location_precision).trim().toLowerCase())) {
    invalid.push('location_precision');
  }
  if (record.location_confidence != null) {
    const confidence=Number(record.location_confidence);
    if (!Number.isFinite(confidence) || confidence<0 || confidence>1) invalid.push('location_confidence');
  }

  if (record.coordinates != null) {
    const lat=Number(record.coordinates?.lat), lng=Number(record.coordinates?.lng);
    if (!Number.isFinite(lat)||!Number.isFinite(lng)||lat < -90||lat > 90||lng < -180||lng > 180) invalid.push('coordinates');
  }
  if (record.recurring != null && typeof record.recurring !== 'boolean') invalid.push('recurring');
  if (record.offerings != null && !validOfferings(record.offerings)) invalid.push('offerings');

  if (present(record.canonical_url)) inspectPromotionUrl('canonical_url', record.canonical_url, blocked, now);
  if (present(record.application_url)) inspectPromotionUrl('application_url', record.application_url, blocked, now);

  if (record.event_end && validPastDate(record.event_end, now)) blocked.push(reason('event_ended','event_end'));
  if (record.application_deadline && validPastDate(record.application_deadline, now)) blocked.push(reason('application_deadline_passed','application_deadline'));

  return Object.freeze({
    schema_version:CUSTOMER_READY_SCHEMA_VERSION,
    ready:missing.length===0&&invalid.length===0&&blocked.length===0,
    missing:Object.freeze(missing),
    invalid:Object.freeze(invalid),
    blocked:Object.freeze(blocked)
  });
}

function inspectPromotionUrl(field, value, blocked, now) {
  let url;
  try { url = new URL(String(value)); } catch { return; }
  const host=url.hostname.toLowerCase(), path=url.pathname.toLowerCase();
  if (WRAPPER_HOSTS.has(host) && (path === '/url' || url.searchParams.has('url') || url.searchParams.has('q'))) {
    blocked.push(reason('search_wrapper_url',field));
  }
  if (SOCIAL_HOSTS.has(host)) blocked.push(reason('social_url',field));
  if (BLOCKED_PATH_TERMS.some(term => path.includes(term))) blocked.push(reason('procurement_or_supplier_url',field));

  const currentYear=Number(now.getUTCFullYear());
  const years=[...String(value).matchAll(/(?:19|20)\d{2}/g)].map(match=>Number(match[0]));
  if (years.some(year => year < currentYear - 1)) blocked.push(reason('stale_year_in_url',field));
}
function reason(code,field){return Object.freeze({code,field});}
function validPastDate(value,now){const timestamp=Date.parse(value);return Number.isFinite(timestamp)&&timestamp < now.getTime();}
function validOfferings(value) {
  if (!Array.isArray(value)) return false;
  return value.every(item => {
    if (typeof item === 'string') return present(item);
    if (!item || typeof item !== 'object' || !present(item.label ?? item.name)) return false;
    return ['kind','cuisine','product'].every(field => item[field] == null || typeof item[field] === 'string');
  });
}
function present(value){return value!==null&&value!==undefined&&String(value).trim()!=='';}
function httpUrl(value){try{const url=new URL(String(value));return url.protocol==='http:'||url.protocol==='https:';}catch{return false;}}
