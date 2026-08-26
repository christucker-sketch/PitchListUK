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
  assert.equal(stableOpportunityId(a), stableOpportunityId({
    ...a,
    event_name: 'Corrected Kings Grove Festival title',
    organiser: 'Corrected organiser display name',
    application_url: 'https://englandsmedievalfestival.com/apply-new?utm_source=email'
  }));
  assert.notEqual(stableOpportunityId(a), stableOpportunityId({ ...a, event_start: '2027-10-10' }));
});

test('legitimate UK place-name collisions retain UK evidence', () => {
  const now = new Date('2026-08-21T00:00:00Z');
  const examples = [
    ready({ source_url: 'https://bristol.gov.uk/business/street-trading', location: 'Bristol BS1 5TR, England' }),
    ready({ source_url: 'https://newcastle.gov.uk/services/business-and-commerce/licences/street-trading', location: 'Newcastle upon Tyne NE1 1AD, England' }),
    ready({ source_url: 'https://northumberland.gov.uk/trading', location: 'Northumberland NE61 2EF, England' })
  ];
  for (const example of examples) {
    const row = evaluateOpportunity(example, { now });
    assert.ok(!row.quality_reasons.includes('non_uk_evidence'), example.source_url);
  }
});

test('semantic and application URL duplicates collapse across sources', () => {
  const rows = [ready(), ready({ event_name: 'Apply to trade at Kings Grove Medieval Festival 2026', source_url: 'https://bristol.gov.uk/events/kings-grove', application_url: 'https://forms.office.com/example' })];
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

test('general council licence guidance is not treated as an available trading pitch', () => {
  const row = evaluateOpportunity(ready({
    event_name: 'Street trading licence',
    organiser: 'Bristol City Council',
    source_url: 'https://bristol.gov.uk/business/street-trading',
    application_url: 'https://bristol.gov.uk/business/street-trading/apply',
    source_evidence: 'Apply for a street trading licence or consent in Bristol, England.'
  }), { now: new Date('2026-08-21T00:00:00Z') });
  assert.equal(row.quality_status, 'needs_work');
  assert.ok(row.quality_reasons.includes('available_pitch_evidence_missing'));
});

test('council permit renewals are not treated as available pitches', () => {
  const row = evaluateOpportunity(ready({
    event_name: 'redcar-cleveland.gov.uk',
    organiser: 'Redcar and Cleveland Borough Council',
    source_url: 'https://redcar-cleveland.gov.uk/licensing-and-permits/street-trading',
    application_url: 'https://redcar-cleveland.gov.uk/forms/renew-street-trading-permit.pdf',
    source_evidence: 'Application to renew a street trading permit in Redcar and Cleveland, England.'
  }), { now: new Date('2026-08-21T00:00:00Z') });
  assert.equal(row.quality_status, 'needs_work');
  assert.ok(row.quality_reasons.includes('available_pitch_evidence_missing'));
});

test('council pages with explicit open trader applications may become customer-ready', () => {
  const row = evaluateOpportunity(ready({
    event_name: 'Bishop Food Festival',
    organiser: 'Durham County Council',
    source_url: 'https://durham.gov.uk/bishop-food-festival',
    application_url: 'https://durham.gov.uk/bishop-food-festival/apply',
    location: 'County Durham, England',
    source_evidence: 'Trader applications are open for Bishop Food Festival on 10 October 2026.'
  }), { now: new Date('2026-08-21T00:00:00Z') });
  assert.equal(row.quality_status, 'customer_ready');
});

test('official recurring-market application wording is direct opportunity evidence', () => {
  for (const fixture of [
    ['https://www.newcastle.gov.uk/business/newcastle-markets/trade-market-newcastle/apply-stall-farmers-market', 'Apply for a stall at the farmers market'],
    ['https://online.northumberland.gov.uk/citizenportal/form.aspx?form=market_app', 'Market Stall Application'],
    ['https://www.barnsley.gov.uk/services/markets/trade-at-our-local-markets/', 'How to apply for a stall at our markets']
  ]) {
    const row = evaluateOpportunity({
      event_name: fixture[1], organiser: 'Council Markets', source_url: fixture[0], application_url: fixture[0],
      location: 'England', region: 'England', source_evidence: `${fixture[1]} currently welcomes traders`,
      query_lane: 'weak-regions-first-party-applications', query_text: 'official source query'
    }, { now: new Date('2026-08-21T00:00:00Z') });
    assert.equal(row.quality_status, 'customer_ready', `${fixture[0]}: ${row.quality_reasons}`);
    assert.equal(row.publishable, true);
  }
});

test('authoritative recurring source type overrides ambiguous festival title keywords', () => {
  const row = evaluateOpportunity({
    event_name: 'Real Food Festival', organiser: 'Real Food Festival',
    source_url: 'https://realfoodfestival.co.uk/join-us', application_url: 'https://realfoodfestival.co.uk/join-us',
    location: 'South East England', region: 'South East England',
    source_evidence: 'Become a trader at our recurring London market. Applications are open.',
    query_lane: 'approved-source-controlled-seven', query_text: 'South East food festival trader application'
  }, { now: new Date('2026-08-26T00:00:00Z') });
  assert.equal(row.opportunity_type, 'recurring_market');
  assert.equal(row.recurring, true);
  assert.equal(row.location, 'London');
  assert.equal(row.region, 'London');
  assert.equal(row.event_start, '');
  assert.ok(!row.quality_reasons.includes('undated_one_off_event'));
  assert.equal(row.quality_status, 'customer_ready');
});

test('approved geography rejects a conflicting query region but preserves a consistent reviewed locality', () => {
  const conflicting = evaluateOpportunity({
    event_name: 'Acton Saturday Market W3', organiser: 'Action West London',
    source_url: 'https://ecoactionwestlondon.org/how-to-become-a-trader',
    application_url: 'https://ecoactionwestlondon.org/how-to-become-a-trader',
    location: 'South East England', region: 'South East England',
    source_evidence: 'Apply to become a trader at Acton Saturday Market W3.',
    query_lane: 'approved-source-controlled-seven', query_text: 'South East market trader application'
  }, { now: new Date('2026-08-26T00:00:00Z') });
  const reviewed = evaluateOpportunity({
    ...conflicting, location: 'Acton, London W3', region: 'London',
    source_evidence: 'Apply to become a trader at Acton Saturday Market W3.'
  }, { now: new Date('2026-08-26T00:00:00Z') });
  assert.equal(conflicting.location, 'London');
  assert.equal(conflicting.region, 'London');
  assert.equal(reviewed.location, 'Acton, London W3');
  assert.equal(reviewed.region, 'London');
});

test('approved source registry has explicit robots, terms and throttle policies', () => {
  assert.ok(APPROVED_SOURCES.length >= 23);
  for (const source of APPROVED_SOURCES) {
    assert.equal(source.approved, true);
    assert.equal(source.country, 'GB');
    assert.equal(source.robots_policy, 'fetch-and-obey');
    assert.ok(source.terms_policy);
    assert.ok(source.min_interval_ms >= 1000);
    assert.equal(source.max_concurrency, 1);
    assert.ok(source.organisation);
  }
  assert.equal(sourceRuleFor('https://unknown.example/traders').approved, false);
});
