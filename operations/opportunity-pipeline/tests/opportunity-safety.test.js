const test = require('node:test');
const assert = require('node:assert/strict');
const { canonicalUrl, stableOpportunityId, mergeDuplicates, evaluateOpportunity, customerReadyOnly } = require('../lib/opportunity-safety');
const { extractDateFields } = require('../lib/date-extraction');
const { APPROVED_SOURCES, sourceRuleFor } = require('../config/sources');

const foreign = [
  ['https://berkshireyogafestival.com/vendors', 'Massachusetts'],
  ['https://vendorsmap.com/cities/manchester-tn', 'Manchester, TN'],
  ['https://cheshirefair.org/vendors', 'New Hampshire'],
  ['https://cheshirefestival.com/apply', 'Cheshire, Connecticut'],
  ['https://cardiff101.com/market', 'Cardiff, CA'],
  ['https://bristolmerchantsassociation.com/fair', 'Bristol, RI'],
  ['https://bristolfarmersmarket.com/vendors', 'Bristol, CT'],
  ['https://berkshirepride.org/vendors', 'Massachusetts'],
  ['https://birminghamal.gov/food-truck', 'Birmingham, AL'],
  ['https://hbwinefest.com/vendors', 'New York'],
  ['https://norfolkagsociety.com/vendors', 'Ontario, Canada'],
  ['https://essexdayfestival.com/vendors', 'Essex, MD'],
  ['https://newcastlede.gov/vendors', 'Delaware'],
  ['https://ngfarmmarket.com/vendors', 'Nova Scotia'],
  ['https://norfolk.gov/food-trucks', 'Norfolk, VA'],
  ['https://newlondonct.gov/pop-up', 'New London, CT'],
  ['https://vtfarmersmarket.org/vendors', 'Vermont'],
  ['https://norfolkvafarmersmarket.com/vendors', 'Virginia'],
  ['https://cornwallchamber.org/vendors', 'Cornwall, NY'],
  ['https://amptrunning.com/vendors', 'Texas'],
  ['https://lctourism.com/foodstock', 'Kentucky'],
  ['https://suffolkpeanutfest.com/vendors', 'Suffolk, VA']
];

function ready(overrides = {}) {
  return {
    event_name: 'Kings Grove Medieval Festival', organiser: 'Englands Medieval Festival',
    source_url: 'https://englandsmedievalfestival.com/traders', application_url: 'https://englandsmedievalfestival.com/apply',
    location: 'East Sussex, England', region: 'East Sussex', event_start: '2026-10-10', event_end: '2026-10-11',
    application_deadline: '2026-09-01', contact_email: '', query_lane: 'county-east-sussex',
    query_text: 'East Sussex festival trader application', source_evidence: 'Official trader application for England event',
    ...overrides
  };
}

test('all 22 audited foreign homonyms are rejected explicitly', () => {
  for (const [source_url, place] of foreign) {
    const row = evaluateOpportunity(ready({ source_url, application_url: `${source_url}/apply`, location: place }), { now: new Date('2026-08-21T00:00:00Z') });
    assert.equal(row.quality_status, 'rejected', source_url);
    assert.ok(row.quality_reasons.includes('non_uk_evidence'), source_url);
  }
});

test('canonical URLs discard tracking noise and stable IDs ignore row ordering', () => {
  assert.equal(canonicalUrl('http://www.example.co.uk/apply/?utm_source=x&b=2&a=1#top'), 'https://example.co.uk/apply?a=1&b=2');
  const a = ready();
  const b = Object.fromEntries(Object.entries(a).reverse());
  assert.equal(stableOpportunityId(a), stableOpportunityId(b));
});

test('semantic and application URL duplicates collapse across sources', () => {
  const rows = [ready(), ready({ source_url: 'https://bristol.gov.uk/events/kings-grove', application_url: 'https://forms.office.com/example' })];
  const merged = mergeDuplicates(rows);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].duplicate_count, 2);
});

test('dates, end dates, deadlines and closed signals are extracted', () => {
  assert.deepEqual(extractDateFields('Event 10 October 2026 to 11 October 2026. Apply by 1 September 2026.'), {
    event_start: '2026-10-10', event_end: '2026-10-11', application_deadline: '2026-09-01', closed_signal: false
  });
  assert.equal(extractDateFields('Applications are now closed.').closed_signal, true);
});

test('expired, closed and undated one-off events cannot become customer-ready', () => {
  const now = new Date('2026-08-21T00:00:00Z');
  assert.equal(evaluateOpportunity(ready({ event_end: '2026-08-20' }), { now }).quality_status, 'rejected');
  assert.equal(evaluateOpportunity(ready({ source_evidence: 'Applications are now closed' }), { now }).quality_status, 'rejected');
  assert.equal(evaluateOpportunity(ready({ event_name: 'Winter Festival', event_start: '', event_end: '', application_deadline: '', source_evidence: 'Official trader application in England' }), { now }).quality_status, 'review');
});

test('organiser, approved source, direct evidence and provenance are mandatory', () => {
  const now = new Date('2026-08-21T00:00:00Z');
  assert.equal(evaluateOpportunity(ready(), { now }).quality_status, 'customer_ready');
  assert.equal(evaluateOpportunity(ready({ organiser: '' }), { now }).quality_status, 'needs_work');
  assert.equal(evaluateOpportunity(ready({ query_lane: '' }), { now }).quality_status, 'needs_work');
  assert.equal(evaluateOpportunity(ready({ application_url: 'https://englandsmedievalfestival.com/info', source_evidence: 'Official event in England' }), { now }).quality_status, 'needs_work');
  assert.equal(customerReadyOnly([evaluateOpportunity(ready(), { now }), evaluateOpportunity(ready({ organiser: '' }), { now })]).length, 1);
});

test('approved source registry has explicit robots, terms and throttle policies', () => {
  assert.equal(APPROVED_SOURCES.length, 12);
  for (const source of APPROVED_SOURCES) {
    assert.equal(source.approved, true);
    assert.equal(source.country, 'GB');
    assert.equal(source.robots_policy, 'fetch-and-obey');
    assert.ok(source.terms_policy);
    assert.ok(source.min_interval_ms >= 1000);
    assert.equal(source.max_concurrency, 1);
  }
  assert.equal(sourceRuleFor('https://unknown.example/traders').approved, false);
});
