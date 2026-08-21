const test = require('node:test');
const assert = require('node:assert/strict');
const {
  inferArea,
  inferBuyerFitTags,
  inferOrganiserType,
  inferRouteType,
  enrichQuality
} = require('../lib/quality-enrichment');
const { inferMarket } = require('../lib/market-routing');

test('infers missing area from event/source context', () => {
  const area = inferArea({
    event_name: 'Applications - Truro Food Festival',
    organiser: 'Applications',
    source_url: 'https://www.trurofoodfestival.co.uk/applications/',
    application_url: 'https://www.trurofoodfestival.co.uk/applications/#apply',
    notes: 'Staged from Cornwall food festival trader application 2026'
  });

  assert.equal(area.area, 'Cornwall');
  assert.equal(area.confidence, 'inferred');
  assert.equal(area.shouldFill, true);
});

test('infers Irish market regions from event/source context', () => {
  const result = enrichQuality({
    event_name: 'Cork Food Festival trader application',
    organiser: 'Cork Food Festival',
    source_url: 'https://example.ie/traders',
    application_url: 'https://example.ie/apply',
    location: '',
    region: '',
    vendor_categories: 'street food traders',
    confidence: 'medium',
    notes: 'Ireland food festival trader application'
  });

  assert.equal(result.row.region, 'Ireland - South-West');
  assert.equal(result.row.area_confidence, 'broad');
  assert.equal(result.row.route_type, 'food_festival');
  assert.equal(result.row.country, 'Ireland');
  assert.equal(result.row.jurisdiction, 'IE');
  assert.equal(result.row.currency, 'EUR');
  assert.equal(result.row.market_domain, 'pitchlist.ie');
});

test('routes Northern Ireland to UK GBP market even when Ireland is mentioned', () => {
  const market = inferMarket({
    event_name: 'Belfast food vendor application',
    source_url: 'https://www.belfastcity.gov.uk/events/trading',
    region: 'Northern Ireland',
    notes: 'Northern Ireland trader route'
  });

  assert.deepEqual(market, {
    country: 'United Kingdom',
    jurisdiction: 'GB-NIR',
    currency: 'GBP',
    market_domain: 'pitchlist.uk',
    tax_region: 'UK'
  });
});

test('defaults UK rows to GBP storefront routing', () => {
  const market = inferMarket({
    event_name: 'Horsham Food Market',
    source_url: 'https://horshammarkets.co.uk/traders',
    region: 'West Sussex'
  });

  assert.equal(market.country, 'United Kingdom');
  assert.equal(market.jurisdiction, 'GB');
  assert.equal(market.currency, 'GBP');
  assert.equal(market.market_domain, 'pitchlist.uk');
});

test('does not route concrete UK areas to Ireland from search-query notes', () => {
  const market = inferMarket({
    event_name: 'Apply to Trade at the Love Local Food Festival',
    source_url: 'https://greendalefoodfestival.com/apply/',
    region: 'Devon',
    location: 'Devon',
    notes: 'Staged from Dublin Ireland street food trader application 2026'
  });

  assert.equal(market.country, 'United Kingdom');
  assert.equal(market.jurisdiction, 'GB');
  assert.equal(market.currency, 'GBP');
  assert.equal(market.market_domain, 'pitchlist.uk');
});

test('does not route UK official domains to Ireland from contaminated county fields', () => {
  const market = inferMarket({
    event_name: 'Tower Hamlets trading in parks',
    source_url: 'https://www.towerhamlets.gov.uk/lgnl/leisure_and_culture/parks_and_open_spaces/Trading-in-parks.aspx',
    region: 'Meath',
    location: 'Meath',
    notes: 'Staged from Ireland market stallholder application food vendor'
  });

  assert.equal(market.country, 'United Kingdom');
  assert.equal(market.jurisdiction, 'GB');
  assert.equal(market.currency, 'GBP');
  assert.equal(market.market_domain, 'pitchlist.uk');
});

test('derives buyer fit tags and route type deterministically', () => {
  const row = {
    event_name: 'London halal burger street food festival',
    organiser: 'Example Events',
    source_url: 'https://example.co.uk/traders',
    application_url: 'https://example.co.uk/trader-application',
    vendor_categories: 'street food; food truck',
    notes: 'Smash burgers, loaded fries and halal-friendly pitches'
  };

  assert.equal(inferRouteType(row), 'food_festival');
  assert.deepEqual(inferBuyerFitTags(row).filter(tag => ['burger', 'loaded_fries', 'halal', 'street_food', 'festival'].includes(tag)).sort(), [
    'burger',
    'festival',
    'halal',
    'loaded_fries',
    'street_food'
  ]);
});

test('enriches confidence, area fields and quality status without model calls', () => {
  const result = enrichQuality({
    event_name: 'Horsham Food Market',
    organiser: 'Horsham Markets',
    source_url: 'https://horshammarkets.co.uk/traders',
    application_url: 'https://horshammarkets.co.uk/trader-application',
    location: '',
    region: '',
    event_start: '2026-09-01',
    vendor_categories: 'street food; hot food',
    last_checked: '2026-07-22',
    confidence: 'medium',
    quality_reasons: 'uk_signal;application_language;event_language;http_application_url;uk_domain'
  });

  assert.equal(result.changed, true);
  assert.equal(result.row.region, 'West Sussex');
  assert.equal(result.row.area_confidence, 'inferred');
  assert.equal(result.row.route_type, 'market');
  assert.equal(result.row.organiser_type, 'market_operator');
  assert.match(result.row.buyer_fit_tags, /street_food/);
  assert.equal(result.row.confidence, 'high');
  assert.equal(result.row.quality_status, 'customer_ready');
});

test('classifies organiser type separately from event type', () => {
  assert.equal(inferOrganiserType({
    organiser: 'Cambridge City Council',
    source_url: 'https://www.cambridge.gov.uk/street-trading'
  }), 'local_council');

  assert.equal(inferOrganiserType({
    organiser: 'Battersea Power Station',
    source_url: 'https://www.kmpresents.co.uk/trade-with-us'
  }), 'festival_company');

  assert.equal(inferOrganiserType({
    organiser: 'Example University Events',
    source_url: 'https://example.ac.uk/campus-food-traders'
  }), 'university');
});
