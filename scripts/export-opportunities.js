const fs = require('fs');
const path = require('path');

const siteRoot = path.join(__dirname, '..');
const pitchlistRoot = process.env.PITCHLIST_HAL_ROOT || path.resolve(siteRoot, '..', '..', 'pitchlist-uk');
const { searchOpportunities } = require(path.join(pitchlistRoot, 'lib', 'opportunity-database'));

const result = searchOpportunities(pitchlistRoot, {
  audience: 'customer',
  include_stale: 'false',
  include_expired: 'false',
  category: '',
  limit: 1000
}, new Date());

const publicStatuses = new Set(['customer_ready', 'review']);
const BOILERPLATE_TITLE = /(skip to main content|we use cookies|to help us give you the best experience|accept all|your privacy|hit enter to search|esc to close|no results found)/i;
const NON_UK_HOST = /(\.ca$|\.nyc$|(^|\.)(downtownkentwa|farmingvillechamber|visitsuffolkva|smmarket|devon\.ca|essexmarket|essexct|londonderrynh|watersidedistrict|downtownnorfolk|festevents|thefairiscoming)\b)/i;
const NON_UK_PLACE = /\b(kent wa|kent washington|south milwaukee|suffolk downtown|suffolk va|farmingville|essex ct|londonderry nh|norfolk waterfront|isle of wight county fair)\b/i;

function hostFor(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function isUkPublicRow(row) {
  const sourceHost = hostFor(row.source_url);
  const applicationHost = hostFor(row.application_url);
  const text = [
    row.event_name,
    row.organiser,
    row.location,
    row.region,
    row.notes,
    row.source_url,
    row.application_url
  ].join(' ');

  if (NON_UK_HOST.test(sourceHost) || NON_UK_HOST.test(applicationHost) || NON_UK_PLACE.test(text)) return false;
  if (BOILERPLATE_TITLE.test(row.event_name || '')) return false;
  if ((row.event_name || '').length > 120) return false;
  if (row.area_confidence === 'unknown' || /^unknown$/i.test(row.region || '')) return false;
  if (!(row.market_domain === 'pitchlist.uk' || row.tax_region === 'UK' || row.country === 'United Kingdom')) return false;
  return true;
}

function cleanTitle(value) {
  return String(value || '')
    .replace(/\s*[-|]\s*Skip to main content.*$/i, '')
    .replace(/\s+Skip to main content.*$/i, '')
    .replace(/\s+(facebook|instagram|twitter|x)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

function displayOrganiser(row, eventName) {
  const organiser = cleanTitle(row.organiser);
  if (!organiser || organiser.toLowerCase() === eventName.toLowerCase()) return '';
  return organiser;
}

const rows = result.rows.filter(row => (
  publicStatuses.has(row.quality_status) &&
  isUkPublicRow(row)
)).map(row => ({
  id: row.id,
  event_name: cleanTitle(row.event_name),
  organiser: displayOrganiser(row, cleanTitle(row.event_name)),
  location: row.location,
  county: row.county,
  region: row.region,
  event_start: row.event_start,
  event_end: row.event_end,
  application_deadline: row.application_deadline,
  stall_fee: row.stall_fee,
  vendor_categories: row.vendor_categories,
  last_checked: row.last_checked,
  freshness_status: row.freshness_status,
  freshness_age_days: row.freshness_age_days,
  confidence: row.confidence,
  quality_status: row.quality_status,
  area_confidence: row.area_confidence,
  route_type: row.route_type,
  organiser_type: row.organiser_type,
  country: row.country,
  jurisdiction: row.jurisdiction,
  currency: row.currency,
  market_domain: row.market_domain,
  tax_region: row.tax_region,
  buyer_fit_tags: row.buyer_fit_tags,
  notes: row.notes,
  application_url: row.application_url,
  source_url: row.source_url,
  latitude: row.latitude,
  longitude: row.longitude,
  coordinate_source: row.coordinate_source,
  coordinate_precision: row.coordinate_precision,
  coordinate_label: row.coordinate_label
}));

const payload = {
  exported_at: new Date().toISOString(),
  source: 'pitchlist-hal-events-active',
  total: rows.length,
  rows
};

const outDir = path.join(siteRoot, 'functions', '_data');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, 'opportunities.mjs'),
  `export const opportunitySnapshot = ${JSON.stringify(payload, null, 2)};\n`
);
console.log(`Exported ${rows.length} customer-safe opportunities to functions/_data/opportunities.mjs`);
