'use strict';

const DISCOVERY_REGIONS = Object.freeze([
  'London', 'South East England', 'South West England', 'East of England', 'East Midlands', 'West Midlands',
  'Yorkshire', 'North West England', 'North East England', 'Wales', 'Scotland', 'Northern Ireland'
]);

const ORGANISER_QUERIES = Object.freeze([
  region => `site:.gov.uk ${region} council markets apply stall trader`,
  region => `site:.gov.uk ${region} event trader application food vendor`,
  region => `${region} market operator become a trader official`,
  region => `${region} food festival trader application official`,
  region => `${region} agricultural county show trade stand application official`,
  region => `${region} Christmas market stallholder application official`,
  region => `${region} racecourse tradestand catering application official`,
  region => `${region} recurring artisan market apply stallholder official`
]);

function discoveryQueries(options = {}) {
  const regions = options.regions?.length ? options.regions : DISCOVERY_REGIONS;
  const templates = options.templates?.length ? options.templates : ORGANISER_QUERIES;
  const offset = Math.max(0, Number(options.offset || 0));
  const all = regions.flatMap(region => templates.map(template => ({ region, query: template(region) })));
  if (!all.length) return [];
  return Array.from({ length: Math.min(Number(options.limit || 12), all.length) }, (_, index) => all[(offset + index) % all.length]);
}

module.exports = { DISCOVERY_REGIONS, ORGANISER_QUERIES, discoveryQueries };
