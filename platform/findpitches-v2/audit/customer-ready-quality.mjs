// Read-only customer-ready quality inspection helpers.
// These diagnostics never mutate candidates, promotion state, or customer storage.

const WRAPPER_HOSTS = new Set(['google.com','www.google.com','google.co.uk','www.google.co.uk','google.com.hk','www.google.com.hk']);
const SOCIAL_HOSTS = new Set(['instagram.com','www.instagram.com','facebook.com','www.facebook.com','x.com','www.x.com','twitter.com','www.twitter.com']);
const RISKY_PATH_TERMS = ['procurement','supplier','vendor-registration','vendor_registration','rfp','tender'];

export function inspectCustomerOpportunity(record = {}, { now = new Date() } = {}) {
  const flags = [];
  inspectUrl('canonical_url', record.canonical_url, flags);
  inspectUrl('application_url', record.application_url, flags);

  const year = Number(now.getUTCFullYear());
  for (const field of ['canonical_url','application_url']) {
    const value = String(record[field] || '');
    const years = [...value.matchAll(/(?:19|20)\d{2}/g)].map(match => Number(match[0]));
    if (years.some(found => found < year - 1)) flags.push({ code: 'stale_year_in_url', field, severity: 'review' });
  }

  if (record.event_end && Date.parse(record.event_end) < now.getTime()) flags.push({ code: 'event_ended', field: 'event_end', severity: 'review' });
  if (record.application_deadline && Date.parse(record.application_deadline) < now.getTime()) flags.push({ code: 'application_deadline_passed', field: 'application_deadline', severity: 'review' });

  const enrichment = ['organiser','location','coordinates','event_start','event_end','application_deadline','offerings','recurring','description'];
  const present = enrichment.filter(field => record[field] != null && record[field] !== '' && !(Array.isArray(record[field]) && record[field].length === 0));
  return Object.freeze({
    id: record.id || null,
    market: record.market || null,
    flag_count: flags.length,
    flags: Object.freeze(flags),
    enrichment_present: Object.freeze(present),
    enrichment_completeness: present.length / enrichment.length
  });
}

export function summariseCustomerQuality(records = [], options = {}) {
  const inspected = records.map(record => inspectCustomerOpportunity(record, options));
  const flags = {};
  for (const item of inspected) for (const flag of item.flags) flags[flag.code] = (flags[flag.code] || 0) + 1;
  return Object.freeze({
    inspected: inspected.length,
    flagged: inspected.filter(item => item.flag_count > 0).length,
    clean: inspected.filter(item => item.flag_count === 0).length,
    flags: Object.freeze(flags),
    records: Object.freeze(inspected)
  });
}

function inspectUrl(field, value, flags) {
  if (!value) return;
  let url;
  try { url = new URL(String(value)); } catch { return; }
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();
  if (WRAPPER_HOSTS.has(host) && (path === '/url' || url.searchParams.has('url') || url.searchParams.has('q'))) {
    flags.push({ code: 'search_wrapper_url', field, severity: 'review' });
  }
  if (SOCIAL_HOSTS.has(host)) flags.push({ code: 'social_url', field, severity: 'review' });
  if (RISKY_PATH_TERMS.some(term => path.includes(term))) flags.push({ code: 'procurement_or_supplier_url', field, severity: 'review' });
}
