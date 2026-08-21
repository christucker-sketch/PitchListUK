'use strict';

const APPROVED_SOURCES = Object.freeze([
  ['englandsmedievalfestival.com', 'England\'s Medieval Festival', 'event-organiser', 'manual-reviewed'],
  ['bristol.gov.uk', 'Bristol City Council', 'local-authority', 'public-service'],
  ['cheshireeast.gov.uk', 'Cheshire East Council', 'local-authority', 'public-service'],
  ['cumberland.gov.uk', 'Cumberland Council', 'local-authority', 'public-service'],
  ['rushmoor.gov.uk', 'Rushmoor Borough Council', 'local-authority', 'public-service'],
  ['tendringdc.gov.uk', 'Tendring District Council', 'local-authority', 'public-service'],
  ['caerphilly.gov.uk', 'Caerphilly County Borough Council', 'local-authority', 'public-service'],
  ['dundeecity.gov.uk', 'Dundee City Council', 'local-authority', 'public-service'],
  ['eastcambs.gov.uk', 'East Cambridgeshire District Council', 'local-authority', 'public-service'],
  ['liverpool.gov.uk', 'Liverpool City Council', 'local-authority', 'public-service'],
  ['nottinghamwinterwonderland.co.uk', 'Nottingham Winter Wonderland', 'event-organiser', 'manual-reviewed'],
  ['west-norfolk.gov.uk', 'Borough Council of King\'s Lynn and West Norfolk', 'local-authority', 'public-service'],
  ['durham.gov.uk', 'Durham County Council', 'local-authority', 'public-service', 'County Durham', 'council_opportunity', '', false, 30],
  ['sunderland.gov.uk', 'Sunderland City Council', 'local-authority', 'public-service'],
  ['newcastle.gov.uk', 'Newcastle City Council', 'local-authority', 'public-service'],
  ['gateshead.gov.uk', 'Gateshead Council', 'local-authority', 'public-service'],
  ['southtyneside.gov.uk', 'South Tyneside Council', 'local-authority', 'public-service'],
  ['northtyneside.gov.uk', 'North Tyneside Council', 'local-authority', 'public-service'],
  ['northumberland.gov.uk', 'Northumberland County Council', 'local-authority', 'public-service'],
  ['middlesbrough.gov.uk', 'Middlesbrough Council', 'local-authority', 'public-service'],
  ['stockton.gov.uk', 'Stockton-on-Tees Borough Council', 'local-authority', 'public-service'],
  ['hartlepool.gov.uk', 'Hartlepool Borough Council', 'local-authority', 'public-service'],
  ['redcar-cleveland.gov.uk', 'Redcar and Cleveland Borough Council', 'local-authority', 'public-service'],
  ['cumberland.gov.uk', 'Cumberland Council', 'local-authority', 'public-service', 'Cumbria', 'recurring_market', 'https://www.cumberland.gov.uk/parks-culture-and-leisure/find-market-near-you', true, 14, 'Cumberland market trader applications', '', '', '/parks-culture-and-leisure/find-market-near-you'],
  ['newcastle.gov.uk', 'Newcastle City Council', 'local-authority', 'public-service', 'Tyne and Wear', 'recurring_market', 'https://www.newcastle.gov.uk/business/newcastle-markets/trade-market-newcastle/apply-stall-farmers-market', true, 14, 'Newcastle Farmers\' Market stall applications', '', '', '/business/newcastle-markets/trade-market-newcastle/apply-stall-farmers-market'],
  ['northumberland.gov.uk', 'Northumberland County Council', 'local-authority', 'public-service', 'Northumberland', 'recurring_market', 'https://online.northumberland.gov.uk/citizenportal/form.aspx?form=market_app', true, 14, 'Northumberland market stall applications', '', '', '/citizenportal/form.aspx'],
  ['durhammarkets.co.uk', 'Durham Markets', 'market-operator', 'manual-reviewed', 'County Durham', 'recurring_market', 'https://durhammarkets.co.uk/become-a-trader/', true, 14, 'Durham Markets trader applications', '', '', '/become-a-trader'],
  ['tastecumbria.co.uk', 'Taste Cumbria', 'event-organiser', 'manual-reviewed', 'Cumbria', 'festival_trader_application', 'https://tastecumbria.co.uk/trader-application-form/', true, 14, 'Taste Cumbria trader applications', '2026-09-26', '2026-09-27', '/trader-application-form'],
  ['barnsley.gov.uk', 'Barnsley Council', 'local-authority', 'public-service', 'South Yorkshire', 'recurring_market', 'https://www.barnsley.gov.uk/services/markets/trade-at-our-local-markets/', true, 14, 'Barnsley local market stall applications', '', '', '/services/markets/trade-at-our-local-markets'],
  ['rotherham.gov.uk', 'Rotherham Council', 'local-authority', 'public-service', 'South Yorkshire', 'recurring_market', 'https://www.rotherham.gov.uk/markets/apply-market-street-trader-licence/1', true, 14, 'Rotherham market trader applications', '', '', '/markets/apply-market-street-trader-licence'],
  ['dorchester-tc.gov.uk', 'Dorchester Town Council', 'local-authority', 'public-service', 'Dorset', 'recurring_market', 'https://www.dorchester-tc.gov.uk/Our-Services/Markets', true, 14, 'Dorchester market stall enquiries', '', '', '/Our-Services/Markets'],
  ['saundersmarkets.co.uk', 'Saunders Markets', 'market-operator', 'manual-reviewed', 'Buckinghamshire', 'recurring_market', 'https://www.saundersmarkets.co.uk/aylesbury-market', true, 14, 'Aylesbury Market trader applications', '', '', '/aylesbury-market'],
  ['buckinghamshire.gov.uk', 'Buckinghamshire Council', 'local-authority', 'public-service', 'Buckinghamshire', 'recurring_market', 'https://weblabsforms.buckinghamshire.gov.uk/ShowForm.asp?fm_fid=325', true, 14, 'Buckinghamshire market stall applications', '', '', '/ShowForm.asp'],
  ['bishopaucklandfoodfestival.co.uk', 'Bishop Auckland Food Festival', 'event-organiser', 'manual-reviewed', 'County Durham', 'festival_trader_application', 'https://bishopaucklandfoodfestival.co.uk/trader-applications-open-for-bishop-food-festival/', false, 14, 'Bishop Auckland Food Festival trader applications', '', '', '/trader-applications-open-for-bishop-food-festival'],
  ['seahamfoodfestival.co.uk', 'Seaham Food Festival', 'event-organiser', 'manual-reviewed', 'County Durham', 'festival_trader_application', 'https://seahamfoodfestival.co.uk/', false, 14, 'Seaham Food Festival trader applications', '', '', '/'],
  ['quaysidemarket.co.uk', 'Quayside Market Sheffield', 'market-operator', 'manual-reviewed', 'South Yorkshire', 'recurring_market', 'https://www.quaysidemarket.co.uk/traders', true, 14, 'Quayside Market Sheffield trader applications', '', '', '/traders'],
  ['peddler.market', 'Peddler Market', 'market-operator', 'manual-reviewed', 'South Yorkshire', 'recurring_market', 'https://www.peddler.market/street-food-applications/', true, 14, 'Peddler Market street-food trader applications', '', '', '/street-food-applications'],
  ['bcpcouncil.gov.uk', 'Bournemouth Christchurch and Poole Council', 'local-authority', 'public-service', 'Dorset', 'street_food_pitch', 'https://www.bcpcouncil.gov.uk/business/starting-and-growing-your-business/street-food-corner-trader/apply-to-trade-at-street-food-corner', true, 14, 'BCP Street Food Corner trader applications', '', '', '/business/starting-and-growing-your-business/street-food-corner-trader/apply-to-trade-at-street-food-corner'],
  ['northyorks.gov.uk', 'North Yorkshire Council', 'local-authority', 'public-service', 'North Yorkshire', 'recurring_market', 'https://www.northyorks.gov.uk/business-and-economy/commercial-services-and-venues/apply-market-pitch/apply-pitch-northallerton-market', true, 14, 'Northallerton Market pitch applications', '', '', '/business-and-economy/commercial-services-and-venues/apply-market-pitch/apply-pitch-northallerton-market'],
  ['markets.leeds.gov.uk', 'Leeds City Council Markets', 'local-authority', 'public-service', 'West Yorkshire', 'street_trading_pitch', 'https://markets.leeds.gov.uk/trade-our-markets/street-trading', true, 14, 'Leeds Markets trading expressions of interest', '', '', '/trade-our-markets/street-trading'],
  ['knutsfordtowncouncil.gov.uk', 'Knutsford Town Council', 'local-authority', 'public-service', 'Cheshire', 'christmas_market', 'https://www.knutsfordtowncouncil.gov.uk/christmas-market/trade', false, 14, 'Knutsford Christmas Market trader applications', '', '', '/christmas-market/trade'],
  ['broadstairsfoodfestival.org.uk', 'Broadstairs Food Festival', 'event-organiser', 'manual-reviewed', 'Kent', 'festival_trader_application', 'https://broadstairsfoodfestival.org.uk/apply-to-exhibit/', false, 14, 'Broadstairs Food Festival exhibitor applications', '', '', '/apply-to-exhibit'],
  ['bristol.feaston.co.uk', 'Bristol Feast On', 'event-organiser', 'manual-reviewed', 'Bristol', 'festival_trader_application', 'https://bristol.feaston.co.uk/traderapplications', false, 14, 'Bristol Feast On trader applications', '', '', '/traderapplications'],
  ['trurofoodfestival.co.uk', 'Truro Food Festival', 'event-organiser', 'manual-reviewed', 'Cornwall', 'festival_trader_application', 'https://www.trurofoodfestival.co.uk/applications/', false, 14, 'Truro Food Festival trader applications', '', '', '/applications'],
  ['aldeburghfoodanddrink.co.uk', 'Aldeburgh Food and Drink Festival', 'event-organiser', 'manual-reviewed', 'Suffolk', 'festival_trader_application', 'https://aldeburghfoodanddrink.co.uk/exhibit/', false, 14, 'Aldeburgh Food and Drink Festival trader applications', '', '', '/exhibit'],
  ['croydon.gov.uk', 'Croydon Council', 'local-authority', 'public-service', 'Surrey', 'recurring_market', 'https://www.croydon.gov.uk/business-licences-and-tenders/markets/apply-market-stall-pitch', true, 14, 'Croydon market stall applications', '', '', '/business-licences-and-tenders/markets/apply-market-stall-pitch'],
  ['stalbans.gov.uk', 'St Albans City and District Council', 'local-authority', 'public-service', 'Hertfordshire', 'recurring_market', 'https://www.stalbans.gov.uk/trade-st-albans-markets', true, 14, 'St Albans Markets trader applications', '', '', '/trade-st-albans-markets'],
  ['medway.gov.uk', 'Medway Council', 'local-authority', 'public-service', 'Kent', 'christmas_market', 'https://www.medway.gov.uk/info/200725/christmas_in_rochester/1809/rochester_christmas_market_stallholder_information/5', false, 14, 'Rochester Christmas Market trader applications', '', '', '/info/200725/christmas_in_rochester/1809/rochester_christmas_market_stallholder_information/5'],
  ['surreyhills.org', 'Surrey Hills National Landscape', 'event-organiser', 'manual-reviewed', 'Surrey', 'artisan_market', 'https://surreyhills.org/surrey-hills-artisan-events-2026-stall-holder-expression-of-interest-form/', false, 14, 'Surrey Hills 2026 artisan event stallholder applications', '', '', '/surrey-hills-artisan-events-2026-stall-holder-expression-of-interest-form'],
  ['visitardsandnorthdown.com', 'Ards and North Down Borough Council', 'local-authority', 'public-service', 'Northern Ireland', 'council_event', 'https://www.visitardsandnorthdown.com/dbimgs/ANDBC%20Trading%20Application%2026%282%29.pdf', false, 14, 'Ards and North Down 2026 event trader applications', '', '', '/dbimgs/ANDBC%20Trading%20Application%2026%282%29.pdf'],
  ['northamptontowncouncil.gov.uk', 'Northampton Town Council', 'local-authority', 'public-service', 'Northamptonshire', 'council_event', 'https://www.northamptontowncouncil.gov.uk/food-vendor-application', false, 14, 'Northampton event food-vendor applications', '', '', '/food-vendor-application'],
  ['greatbritishfoodfestival.com', 'Great British Food Festival', 'event-organiser', 'manual-reviewed', 'United Kingdom', 'festival_trader_application', 'https://greatbritishfoodfestival.com/traders/', true, 14, 'Great British Food Festival trader applications', '', '', '/traders'],
  ['yorkfoodfestival.com', 'York Food Festival', 'event-organiser', 'manual-reviewed', 'North Yorkshire', 'festival_trader_application', 'https://www.yorkfoodfestival.com/trade/', false, 14, 'York Food Festival trader applications', '', '', '/trade'],
  ['townandcountrymarkets.co.uk', 'Town and Country Markets', 'market-operator', 'manual-reviewed', 'Yorkshire', 'recurring_market', 'https://townandcountrymarkets.co.uk/markets/walton-street-hull-market/register-to-trade.html', true, 14, 'Walton Street Hull Market trader registrations', '', '', '/markets/walton-street-hull-market/register-to-trade.html'],
  ['santapod.co.uk', 'Santa Pod Raceway', 'private-venue', 'manual-reviewed', 'Northamptonshire', 'venue_trader_application', 'https://santapod.co.uk/commercial/traders/', true, 30, 'Santa Pod Raceway trader applications', '', '', '/commercial/traders'],
  ['thejockeyclub.co.uk', 'The Jockey Club', 'private-venue', 'manual-reviewed', 'Gloucestershire', 'venue_trader_application', 'https://www.thejockeyclub.co.uk/cheltenham/plan-your-day/shopping/apply/', true, 30, 'Cheltenham Racecourse tradestand applications', '', '', '/cheltenham/plan-your-day/shopping/apply'],
  ['mineheadbayfestival.co.uk', 'Minehead Bay Festival', 'event-organiser', 'manual-reviewed', 'Somerset', 'festival_trader_application', 'https://mineheadbayfestival.co.uk/traders/', false, 14, 'Minehead Bay Festival trader applications', '', '', '/traders'],
].map(([host, organisation, type, termsPolicy, geographicCoverage = '', opportunityType = '', applicationRoute = '', recurring = false, pollingDays = 30, opportunityTitle = '', knownOpenEventStart = '', knownOpenEventEnd = '', sourcePathPrefix = '']) => Object.freeze({
  host,
  organisation,
  type,
  country: 'GB',
  approved: true,
  robots_policy: 'fetch-and-obey',
  terms_policy: termsPolicy,
  min_interval_ms: type === 'local-authority' ? 1250 : 2000,
  max_concurrency: 1,
  allowed_as_application_host: true,
  geographic_coverage: geographicCoverage,
  opportunity_type: opportunityType,
  official_application_route: applicationRoute,
  recurring,
  last_successful_discovery: null,
  observed_yield: { customer_ready: 0, rejected: 0 },
  rejection_reasons: [],
  recommended_polling_days: pollingDays,
  opportunity_title: opportunityTitle,
  known_open_event_start: knownOpenEventStart,
  known_open_event_end: knownOpenEventEnd,
  source_path_prefix: sourcePathPrefix,
})));

const APPLICATION_HOSTS = Object.freeze([
  'form.jotform.com',
  'forms.office.com',
  'docs.google.com',
  'forms.gle',
  'gov.uk',
].map(host => Object.freeze({
  host,
  type: 'application-platform',
  approved: false,
  allowed_as_application_host: true,
  robots_policy: 'fetch-and-obey',
  terms_policy: 'source-specific-review-required',
  min_interval_ms: 2000,
  max_concurrency: 1,
})));

function hostname(value) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function hostMatches(host, configured) {
  return host === configured || host.endsWith(`.${configured}`);
}

function sourceRuleFor(value) {
  const host = hostname(value);
  let pathname = '';
  try { pathname = new URL(value).pathname; } catch {}
  const rules = [...APPROVED_SOURCES, ...APPLICATION_HOSTS];
  return rules.find(rule => hostMatches(host, rule.host) && rule.source_path_prefix && pathname.toLowerCase().startsWith(rule.source_path_prefix.toLowerCase()))
    || rules.find(rule => hostMatches(host, rule.host) && !rule.source_path_prefix)
    || Object.freeze({
    host,
    type: 'unapproved-discovery-source',
    approved: false,
    allowed_as_application_host: false,
    robots_policy: 'fetch-and-obey',
    terms_policy: 'manual-review-required-before-promotion',
    min_interval_ms: 2500,
    max_concurrency: 1,
    });
}

function termsReviewed(rule) {
  return ['manual-reviewed', 'public-service'].includes(rule?.terms_policy);
}

module.exports = {
  APPROVED_SOURCES,
  APPLICATION_HOSTS,
  hostname,
  sourceRuleFor,
  termsReviewed,
};
