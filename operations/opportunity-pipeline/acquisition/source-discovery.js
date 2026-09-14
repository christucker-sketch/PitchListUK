'use strict';

const DISCOVERY_REGIONS = Object.freeze([
  'London', 'South East England', 'South West England', 'East of England', 'East Midlands', 'West Midlands',
  'Yorkshire', 'North West England', 'North East England', 'Wales', 'Scotland', 'Northern Ireland'
]);

const EXCLUDED_DISCOVERY_SITES = '-site:facebook.com -site:instagram.com -site:youtube.com -site:eventbrite.co.uk -site:eventbrite.com -site:linkedin.com';
const DISCOVERY_TEMPLATES = Object.freeze([
  { id: 'council_markets', priority: 100, query: region => `site:.gov.uk ${region} "apply to trade" market trader stall` },
  { id: 'council_market_stalls', priority: 99, query: region => `site:.gov.uk ${region} "market stall" application trader` },
  { id: 'council_events', priority: 98, query: region => `site:.gov.uk ${region} "event trader" application vendor` },
  { id: 'council_food_vendors', priority: 97, query: region => `site:.gov.uk ${region} "food vendor" application event` },
  { id: 'council_festivals', priority: 96, query: region => `site:.gov.uk ${region} festival trader application vendor` },
  { id: 'council_christmas', priority: 95, query: region => `site:.gov.uk ${region} Christmas market stallholder application` },
  { id: 'council_concessions', priority: 94, query: region => `site:.gov.uk ${region} concession pitch application food trader` },
  { id: 'council_street_markets', priority: 93, query: region => `site:.gov.uk ${region} market trader application stallholder` }
]);
const ORGANISER_QUERIES = Object.freeze(DISCOVERY_TEMPLATES.map(template => template.query));

function templateKeyForQuery(query) {
  const text = String(query || '');
  if (/site:\.gov\.uk.*"apply to trade".*market trader stall/i.test(text)) return 'council_markets';
  if (/site:\.gov\.uk.*"market stall".*application trader/i.test(text)) return 'council_market_stalls';
  if (/site:\.gov\.uk.*"event trader".*application vendor/i.test(text)) return 'council_events';
  if (/site:\.gov\.uk.*"food vendor".*application event/i.test(text)) return 'council_food_vendors';
  if (/site:\.gov\.uk.*festival trader application vendor/i.test(text)) return 'council_festivals';
  if (/site:\.gov\.uk.*Christmas market stallholder application/i.test(text)) return 'council_christmas';
  if (/site:\.gov\.uk.*concession pitch application food trader/i.test(text)) return 'council_concessions';
  if (/site:\.gov\.uk.*market trader application stallholder/i.test(text)) return 'council_street_markets';
  return '';
}

function discoveryQueries(options = {}) {
  const regions = options.regions?.length ? options.regions : DISCOVERY_REGIONS;
  const templates = options.templates?.length
    ? options.templates.map((template, index) => typeof template === 'function' ? { id: `custom_${index}`, query: template } : template)
    : DISCOVERY_TEMPLATES;
  const offset = Math.max(0, Number(options.offset || 0));
  const all = regions.flatMap(region => templates.map(template => ({
    region,
    template_id: template.id,
    query: `${template.query(region)} ${EXCLUDED_DISCOVERY_SITES}`.trim()
  })));
  if (!all.length) return [];
  return Array.from({ length: Math.min(Number(options.limit || 12), all.length) }, (_, index) => all[(offset + index) % all.length]);
}

module.exports = {
  DISCOVERY_REGIONS, DISCOVERY_TEMPLATES, ORGANISER_QUERIES, EXCLUDED_DISCOVERY_SITES,
  templateKeyForQuery, discoveryQueries
};
