const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isCaRow,
  isCustomerVisibleCaRow,
  searchCaCustomerRows
} = require('../lib/ca-customer-search');

const rows = [
  {
    id: 'CA-OPP-AAAAAAAAAAAA', event_name: 'Toronto Food Festival', organiser: 'Toronto Events',
    location: 'Toronto', locality: 'Toronto', region_code: 'ON', region: 'Ontario', country: 'Canada',
    jurisdiction: 'CA-ON', currency: 'CAD', vendor_categories: ['food_vendor'], opportunity_type: 'event',
    event_start: '2026-10-17', quality_status: 'customer_ready', publishable: true, area_confidence: 'exact',
    source_url: 'https://example.org/toronto', application_url: 'https://example.org/toronto/apply', notes: 'Apply now.'
  },
  {
    id: 'CA-OPP-BBBBBBBBBBBB', event_name: 'Vancouver Makers Market', organiser: 'Vancouver Makers',
    location: 'Vancouver', locality: 'Vancouver', region_code: 'BC', region: 'British Columbia', country: 'Canada',
    jurisdiction: 'CA-BC', currency: 'CAD', vendor_categories: ['craft_vendor'], opportunity_type: 'recurring',
    event_start: '', quality_status: 'customer_ready', publishable: true, area_confidence: 'exact',
    source_url: 'https://example.org/vancouver', application_url: 'https://example.org/vancouver/apply', notes: 'Weekly market.'
  },
  {
    id: 'CA-OPP-CCCCCCCCCCCC', event_name: 'Yukon Winter Market', organiser: 'Yukon Events',
    location: 'Whitehorse', region_code: 'YT', region: 'Yukon', country: 'Canada', jurisdiction: 'CA-YT', currency: 'CAD',
    vendor_categories: ['craft_vendor'], opportunity_type: 'event', event_start: '2026-11-01',
    quality_status: 'customer_ready', publishable: true, area_confidence: 'exact',
    source_url: 'https://example.org/yukon', application_url: 'https://example.org/yukon/apply'
  },
  {
    id: 'CA-OPP-DDDDDDDDDDDD', event_name: 'Held Ontario Event', region_code: 'ON', region: 'Ontario', country: 'Canada',
    jurisdiction: 'CA-ON', currency: 'CAD', quality_status: 'review', publishable: false, area_confidence: 'exact'
  },
  {
    id: 'CA-OPP-EEEEEEEEEEEE', event_name: 'Bad Geography', region_code: 'ZZ', region: 'Made Up', country: 'Canada',
    jurisdiction: 'CA-ZZ', currency: 'CAD', quality_status: 'customer_ready', publishable: true, area_confidence: 'exact'
  },
  {
    id: 'opp_us', event_name: 'Seattle Market', region_code: 'WA', country: 'United States', jurisdiction: 'US-WA',
    currency: 'USD', quality_status: 'customer_ready', publishable: true, area_confidence: 'exact'
  }
];

test('Canada customer boundary accepts only canonical CA province and territory rows', () => {
  assert.equal(isCaRow(rows[0]), true);
  assert.equal(isCaRow(rows[1]), true);
  assert.equal(isCaRow(rows[2]), true);
  assert.equal(isCaRow(rows[4]), false);
  assert.equal(isCaRow(rows[5]), false);
});

test('Canada customer visibility requires exact customer-ready publication proof', () => {
  assert.equal(isCustomerVisibleCaRow(rows[0]), true);
  assert.equal(isCustomerVisibleCaRow(rows[3]), false);
  assert.equal(isCustomerVisibleCaRow({ ...rows[0], area_confidence: 'inferred' }), false);
  assert.equal(isCustomerVisibleCaRow({ ...rows[0], currency: 'USD' }), false);
});

test('Canada customer search never leaks non-CA, invalid-geography or staging rows', () => {
  const result = searchCaCustomerRows(rows, { fullAccess: true });
  assert.equal(result.total, 3);
  assert.deepEqual(result.rows.map(row => row.id).sort(), [
    'CA-OPP-AAAAAAAAAAAA', 'CA-OPP-BBBBBBBBBBBB', 'CA-OPP-CCCCCCCCCCCC'
  ]);
});

test('Canada customer search filters a canonical province or territory', () => {
  const province = searchCaCustomerRows(rows, { province: 'BC', fullAccess: true });
  assert.equal(province.region_code, 'BC');
  assert.equal(province.total, 1);
  assert.equal(province.rows[0].id, 'CA-OPP-BBBBBBBBBBBB');

  const territory = searchCaCustomerRows(rows, { territory: 'YT', fullAccess: true });
  assert.equal(territory.total, 1);
  assert.equal(territory.rows[0].id, 'CA-OPP-CCCCCCCCCCCC');
});

test('unknown Canada region code fails closed', () => {
  const result = searchCaCustomerRows(rows, { province: 'ZZ', fullAccess: true });
  assert.equal(result.total, 0);
  assert.deepEqual(result.rows, []);
});

test('Canada preview search redacts source and application routes', () => {
  const result = searchCaCustomerRows(rows, { q: 'Toronto', fullAccess: false });
  assert.equal(result.total, 1);
  assert.equal(result.rows[0].locked, true);
  assert.equal(result.rows[0].source_url, '');
  assert.equal(result.rows[0].application_url, '');
});

test('Canada subscriber search keeps source and application routes', () => {
  const result = searchCaCustomerRows(rows, { category: 'craft', fullAccess: true });
  assert.equal(result.total, 2);
  assert.ok(result.rows.every(row => row.source_url && row.application_url));
});
