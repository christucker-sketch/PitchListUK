const test = require('node:test');
const assert = require('node:assert/strict');

const {
  US_VENDOR_TERMS,
  US_NEGATIVE_TERMS,
  US_SOURCE_CLASSES,
  TEXAS_DISCOVERY_QUERIES,
  US_DATE_RULES,
  US_VALIDATION_RULES
} = require('../config/us-acquisition-profile.js');
const {
  classifyUsOpportunityEvidence,
  validateTexasPilotRow
} = require('../lib/us-acquisition-classifier.js');

test('US acquisition vocabulary contains core vendor and concession language', () => {
  for (const term of ['vendor application', 'food truck', 'exhibitor application', 'booth application', 'concession vendor']) {
    assert.ok(US_VENDOR_TERMS.includes(term));
  }
});

test('US negative vocabulary explicitly blocks procurement and supplier onboarding', () => {
  for (const term of ['procurement', 'supplier registration', 'request for proposal', 'approved vendor list']) {
    assert.ok(US_NEGATIVE_TERMS.includes(term));
  }
});

test('US source classes prioritise first-party civic and event organisations', () => {
  for (const sourceClass of ['city-government', 'county-government', 'parks-and-recreation', 'market-organisation', 'festival-organisation']) {
    assert.ok(US_SOURCE_CLASSES.includes(sourceClass));
  }
});

test('Texas discovery queries are Texas-scoped and include vendor intent', () => {
  assert.ok(TEXAS_DISCOVERY_QUERIES.length >= 20);
  assert.ok(TEXAS_DISCOVERY_QUERIES.every(query => /texas/i.test(query)));
  assert.ok(TEXAS_DISCOVERY_QUERIES.some(query => /food vendor application/i.test(query)));
  assert.ok(TEXAS_DISCOVERY_QUERIES.some(query => /farmers market vendor application/i.test(query)));
});

test('US date rules are isolated to month-day-year assumptions', () => {
  assert.equal(US_DATE_RULES.namedMonthOrder, 'month-day-year');
  assert.equal(US_DATE_RULES.numericOrder, 'month-day-year');
  assert.equal(US_DATE_RULES.ambiguousNumericDatesRequireCountryContext, true);
});

test('US validation keeps automatic publishing disabled and Texas as pilot', () => {
  assert.equal(US_VALIDATION_RULES.requiredCountryCode, 'US');
  assert.equal(US_VALIDATION_RULES.pilotRegionCode, 'TX');
  assert.equal(US_VALIDATION_RULES.automaticPublishing, false);
});

test('US classifier accepts genuine vendor applications', () => {
  const result = classifyUsOpportunityEvidence({
    title: '2027 Festival Vendor Application',
    body: 'Applications are open for food trucks and artisan vendors.'
  });
  assert.equal(result.decision, 'candidate');
  assert.ok(result.positiveSignals.length > 0);
});

test('US classifier rejects a vendor route when the application period is explicitly closed', () => {
  const result = classifyUsOpportunityEvidence({
    title: '61st Street Farmers Market Vendor Application',
    body: 'The 2026 outdoor market vendor application period has CLOSED. Join the waitlist by email.'
  });
  assert.equal(result.decision, 'rejected');
  assert.ok(result.positiveSignals.includes('vendor application'));
  assert.ok(result.negativeSignals.includes('applications closed'));
});

test('US classifier does not confuse a future closing date with an already closed application', () => {
  const result = classifyUsOpportunityEvidence({
    title: 'Holiday Market Vendor Application',
    body: 'Vendor applications are open now and applications close September 15, 2026.'
  });
  assert.equal(result.decision, 'candidate');
  assert.ok(!result.negativeSignals.includes('applications closed'));
});

test('US classifier rejects applications restricted to returning or invited vendors', () => {
  const result = classifyUsOpportunityEvidence({
    title: '2026 Vendor Application',
    body: 'We are only accepting applications for our 2026 season from returning vendors or those invited to apply directly by the market manager. Everyone else should not apply.'
  });
  assert.equal(result.decision, 'rejected');
  assert.ok(result.negativeSignals.includes('application restricted to returning or invited vendors'));
});

test('US classifier keeps genuinely open applications that also welcome returning vendors', () => {
  const result = classifyUsOpportunityEvidence({
    title: '2026 Vendor Application',
    body: 'Returning vendors are welcome, and new vendors may apply through this open application.'
  });
  assert.equal(result.decision, 'candidate');
  assert.ok(!result.negativeSignals.includes('application restricted to returning or invited vendors'));
});

test('US classifier rejects procurement even when the page says vendor', () => {
  const result = classifyUsOpportunityEvidence({
    title: 'Vendor Registration',
    body: 'Register in our supplier portal to receive request for proposal notices.'
  });
  assert.equal(result.decision, 'rejected');
  assert.ok(result.negativeSignals.includes('supplier portal'));
});

test('mixed event pages may contain sponsor calls without becoming sponsorship-only', () => {
  const result = classifyUsOpportunityEvidence({
    title: 'Fall Festival',
    body: 'Become a Vendor. Download the food vendor application. Become a Sponsor for other festival opportunities.'
  });
  assert.equal(result.decision, 'candidate');
  assert.ok(result.positiveSignals.includes('vendor application'));
  assert.ok(result.negativeSignals.includes('become a sponsor'));
});

test('sponsorship-only pages remain rejected', () => {
  const result = classifyUsOpportunityEvidence({
    title: 'Festival Sponsorship Opportunities',
    body: 'Become a sponsor and support our annual event.'
  });
  assert.equal(result.decision, 'rejected');
  assert.ok(result.negativeSignals.includes('become a sponsor'));
});

test('US classifier leaves weak generic pages for review rather than promoting them', () => {
  const result = classifyUsOpportunityEvidence({
    title: 'Community Events',
    body: 'See what is happening around town this year.'
  });
  assert.equal(result.decision, 'review');
});

test('Texas pilot validation rejects non-US and non-Texas rows', () => {
  assert.equal(validateTexasPilotRow({ country_code: 'US', region_code: 'TX', jurisdiction: 'US-TX', source_url: 'https://example.gov/vendors', event_name: 'Market' }).valid, true);
  assert.equal(validateTexasPilotRow({ country_code: 'GB', region_code: 'TX', source_url: 'https://example.com', event_name: 'Market' }).valid, false);
  assert.equal(validateTexasPilotRow({ country_code: 'US', region_code: 'CA', source_url: 'https://example.com', event_name: 'Market' }).valid, false);
});
