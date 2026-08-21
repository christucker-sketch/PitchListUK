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
