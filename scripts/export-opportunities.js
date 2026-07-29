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

const rows = result.rows.filter(row => row.quality_status === 'customer_ready').map(row => ({
  id: row.id,
  event_name: row.event_name,
  organiser: row.organiser,
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
