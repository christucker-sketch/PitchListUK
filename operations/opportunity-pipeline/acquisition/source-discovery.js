'use strict';

const DISCOVERY_REGIONS = Object.freeze([
  'London', 'South East England', 'South West England', 'East of England', 'East Midlands', 'West Midlands',
  'Yorkshire', 'North West England', 'North East England', 'Wales', 'Scotland', 'Northern Ireland'
]);

const EXCLUDED_DISCOVERY_SITES = '-site:facebook.com -site:instagram.com -site:youtube.com -site:eventbrite.co.uk -site:eventbrite.com -site:linkedin.com';
const DISCOVERY_TEMPLATES = Object.freeze([
  { id: 'council_markets', priority: 90, query: region => `site:.gov.uk ${region} council markets apply stall trader` },
  { id: 'council_events', priority: 88, query: region => `site:.gov.uk ${region} event trader application food vendor` },
  { id: 'market_operator', priority: 96, query: region => `${region} market operator become a trader official` },
  { id: 'food_festival', priority: 94, query: region => `${region} food festival trader application official` },
  { id: 'county_show', priority: 72, query: region => `${region} agricultural county show trade stand application official` },
  { id: 'christmas_market', priority: 98, query: region => `${region} Christmas market stallholder application official` },
  { id: 'racecourse', priority: 65, query: region => `${region} racecourse tradestand catering application official` },
  { id: 'artisan_market', priority: 76, query: region => `${region} recurring artisan market apply stallholder official` }
]);
const ORGANISER_QUERIES = Object.freeze(DISCOVERY_TEMPLATES.map(template => template.query));

function templateKeyForQuery(query) {
  const text = String(query || '');
  if (/site:\.gov\.uk.*council markets/i.test(text)) return 'council_markets';
  if (/site:\.gov\.uk.*event trader/i.test(text)) return 'council_events';
  if (/market operator become a trader/i.test(text)) return 'market_operator';
  if (/food festival trader application/i.test(text)) return 'food_festival';
  if (/agricultural county show/i.test(text)) return 'county_show';
  if (/Christmas market stallholder/i.test(text)) return 'christmas_market';
  if (/racecourse tradestand/i.test(text)) return 'racecourse';
  if (/recurring artisan market/i.test(text)) return 'artisan_market';
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
