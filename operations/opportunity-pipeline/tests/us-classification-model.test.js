const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extractTexasOpportunity,
  extractUsDate,
  extractCategories,
  stableId
} = require('../lib/us-opportunity-extractor');

test('US dates parse month-day-year without changing GB date code', () => {
  assert.equal(extractUsDate('Event Date: August 29, 2026', ['event date']), '2026-08-29');
  assert.equal(extractUsDate('Application deadline 09/15/2026', ['application deadline']), '2026-09-15');
  assert.equal(extractUsDate('Event Date 10/24/26', ['event date']), '2026-10-24');
  assert.equal(extractUsDate('Deadline 15/09/2026', ['deadline']), '');
});

test('US category mapping recognises food trucks, concessions and craft vendors', () => {
  const categories = extractCategories('Food trucks, concession vendors and artisan vendors are invited to apply.');
  assert.ok(categories.includes('food_truck'));
  assert.ok(categories.includes('food_vendor'));
  assert.ok(categories.includes('craft_vendor'));
});

test('one-off Texas vendor event becomes a non-publishable structured candidate', () => {
  const result = extractTexasOpportunity({
    title: 'Austin Fall Festival - Food Vendor Application',
    text: 'Hosted by Downtown Austin Alliance. Event Date: October 17, 2026. Food vendors and food trucks may apply. Austin, TX 78701.',
    url: 'https://example.org/austin-fall-festival',
    organiser: 'Downtown Austin Alliance',
    links: [{ text: 'Food Vendor Application', url: 'https://example.org/austin-fall-festival/apply' }]
  });
  assert.equal(result.status, 'candidate');
  assert.equal(result.row.country_code, 'US');
  assert.equal(result.row.region_code, 'TX');
  assert.equal(result.row.currency, 'USD');
  assert.equal(result.row.event_start, '2026-10-17');
  assert.equal(result.row.locality, 'Austin');
  assert.equal(result.row.postal_code, '78701');
  assert.equal(result.row.publishable, false);
});

test('recurring Texas market does not require a one-off event date', () => {
  const result = extractTexasOpportunity({
    title: 'Downtown Farmers Market Vendor Applications',
    text: 'Organized by Example Market Association. Weekly market every Saturday. Ongoing vendor applications for farmers market vendors. Dallas, TX 75201.',
    organiser: 'Example Market Association',
    url: 'https://example.org/market/vendors',
    links: [{ text: 'Vendor Application', url: 'https://example.org/market/vendors/apply' }]
  });
  assert.equal(result.status, 'candidate');
  assert.equal(result.row.recurring, true);
  assert.equal(result.row.opportunity_type, 'recurring');
  assert.equal(result.row.event_start, '');
  assert.equal(result.row.locality, 'Dallas');
});

test('verified multi-event Texas application does not require one arbitrary event date', () => {
  const result = extractTexasOpportunity({
    title: '2026 Food & Drink Vendor Application',
    text: 'Food vendor application covering Family Fright Fest, American Heroes, and Holiday in the Park.',
    organiser: 'City of Example Special Events',
    locality: 'Example',
    url: 'https://example.gov/vendors',
    application_url: 'https://example.gov/vendors/apply',
    multi_event: true
  });
  assert.equal(result.status, 'candidate');
  assert.equal(result.row.multi_event, true);
  assert.equal(result.row.opportunity_type, 'multi-event');
  assert.equal(result.row.event_start, '');
  assert.equal(result.row.publishable, false);
});

test('verified event metadata preserves start and end dates', () => {
  const result = extractTexasOpportunity({
    title: 'Fall Festival Vendor Application',
    text: 'Vendor applications are open for the annual fall festival.',
    organiser: 'Town of Example',
    locality: 'Example',
    url: 'https://example.gov/fallfestival',
    application_url: 'https://example.gov/fallfestival',
    event_start: '2026-10-09',
    event_end: '2026-10-10'
  });
  assert.equal(result.status, 'candidate');
  assert.equal(result.row.event_start, '2026-10-09');
  assert.equal(result.row.event_end, '2026-10-10');
});

test('procurement page is rejected even with vendor registration language', () => {
  const result = extractTexasOpportunity({
    title: 'City Vendor Registration',
    text: 'Register as a vendor for procurement opportunities, bids, RFPs and purchasing contracts.',
    url: 'https://example.gov/procurement/vendor-registration'
  });
  assert.equal(result.status, 'rejected');
  assert.equal(result.row, undefined);
});

test('missing organiser or application route stays in review and never publishable', () => {
  const result = extractTexasOpportunity({
    title: 'Houston Street Fair Vendors Wanted',
    text: 'Vendors wanted for our community street fair. Event Date: November 8, 2026. Houston, TX 77002.',
    url: 'https://example.org/street-fair'
  });
  assert.equal(result.status, 'review');
  assert.ok(result.reasons.includes('missing_application_route'));
  assert.ok(result.reasons.includes('missing_organiser'));
  assert.equal(result.row.publishable, false);
});

test('Texas extractor does not invent coordinates for unseeded ZIP codes', () => {
  const result = extractTexasOpportunity({
    title: 'Austin Makers Market Vendor Application',
    text: 'Hosted by Makers Group. Event Date: December 5, 2026. Craft vendor application. Austin, TX 78702.',
    organiser: 'Makers Group',
    url: 'https://example.org/makers',
    links: [{ text: 'Vendor Application', url: 'https://example.org/makers/apply' }]
  });
  assert.equal(result.row.postal_code, '78702');
  assert.equal(result.row.latitude, '');
  assert.equal(result.row.longitude, '');
});

test('injected ZIP index enriches geography without changing extractor code path', () => {
  const result = extractTexasOpportunity({
    title: 'Austin Makers Market Vendor Application',
    text: 'Hosted by Makers Group. Event Date: December 5, 2026. Craft vendor application. Austin, TX 78702.',
    organiser: 'Makers Group',
    url: 'https://example.org/makers',
    links: [{ text: 'Vendor Application', url: 'https://example.org/makers/apply' }]
  }, {
    zipIndex: {
      '78702': { postal_code: '78702', locality: 'Austin', region_code: 'TX', region_name: 'Texas', latitude: 30.2638, longitude: -97.7145 }
    }
  });
  assert.equal(result.row.latitude, 30.2638);
  assert.equal(result.row.longitude, -97.7145);
  assert.equal(result.row.coordinate_source, 'offline-zip-index');
  assert.equal(result.row.coordinate_precision, 'postal');
  assert.equal(result.row.coordinate_label, '78702 Austin');
});

test('stable IDs include US identity material and are deterministic', () => {
  const a = stableId(['US', 'Example Org', 'Example Fair', 'Austin', '2026-10-17']);
  const b = stableId(['US', 'Example Org', 'Example Fair', 'Austin', '2026-10-17']);
  const c = stableId(['US', 'Example Org', 'Example Fair', 'Dallas', '2026-10-17']);
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^opp_us_[a-f0-9]{20}$/);
});
