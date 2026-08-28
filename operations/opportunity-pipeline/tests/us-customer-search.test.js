const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isUsRow,
  isUsTexasRow,
  isCustomerVisibleUsRow,
  searchUsCustomerRows
} = require('../lib/us-customer-search');

const rows = [
  {
    stable_id: 'opp_us_a', event_name: 'Austin Food Truck Fair', organiser: 'Austin Events',
    location: 'Austin', locality: 'Austin', region_code: 'TX', region_name: 'Texas', country_code: 'US', jurisdiction: 'US-TX',
    vendor_categories: ['food_truck','food_vendor'], opportunity_type: 'event', event_start: '2026-10-17',
    latitude: 30.2711, longitude: -97.7437, quality_status: 'customer_ready', publishable: true,
    source_url: 'https://example.org/austin', application_url: 'https://example.org/austin/apply', notes: 'Apply now.'
  },
  {
    stable_id: 'opp_us_b', event_name: 'Dallas Makers Market', organiser: 'Dallas Makers',
    location: 'Dallas', locality: 'Dallas', region_code: 'TX', region_name: 'Texas', country_code: 'US', jurisdiction: 'US-TX',
    vendor_categories: ['craft_vendor'], opportunity_type: 'recurring', event_start: '',
    latitude: 32.7876, longitude: -96.7994, quality_status: 'customer_ready', publishable: true,
    source_url: 'https://example.org/dallas', application_url: 'https://example.org/dallas/apply', notes: 'Weekly market.'
  },
  {
    stable_id: 'opp_us_fl', event_name: 'Orlando Makers Market', organiser: 'Orlando Events',
    location: 'Orlando', locality: 'Orlando', region_code: 'FL', region_name: 'Florida', country_code: 'US', jurisdiction: 'US-FL',
    vendor_categories: ['craft_vendor'], opportunity_type: 'event', event_start: '2026-11-01',
    quality_status: 'customer_ready', publishable: true,
    source_url: 'https://example.org/orlando', application_url: 'https://example.org/orlando/apply', notes: 'Apply now.'
  },
  {
    stable_id: 'opp_us_hold', event_name: 'Held Texas Event', region_code: 'TX', country_code: 'US', jurisdiction: 'US-TX',
    quality_status: 'review', publishable: false
  },
  {
    stable_id: 'opp_gb', event_name: 'London Market', region_code: 'London', country_code: 'GB', jurisdiction: 'GB',
    quality_status: 'customer_ready', publishable: true
  }
];

test('US customer boundary accepts valid state-scoped US rows only', () => {
  assert.equal(isUsRow(rows[0]), true);
  assert.equal(isUsRow(rows[2]), true);
  assert.equal(isUsTexasRow(rows[0]), true);
  assert.equal(isUsTexasRow(rows[2]), false);
  assert.equal(isUsRow(rows[4]), false);
});

test('US customer visibility requires customer_ready and publishable=true', () => {
  assert.equal(isCustomerVisibleUsRow(rows[0]), true);
  assert.equal(isCustomerVisibleUsRow(rows[2]), true);
  assert.equal(isCustomerVisibleUsRow(rows[3]), false);
});

test('US customer search never leaks GB or staging-only rows', () => {
  const result = searchUsCustomerRows(rows, { fullAccess: true });
  assert.equal(result.total, 3);
  assert.deepEqual(result.rows.map(row => row.stable_id).sort(), ['opp_us_a','opp_us_b','opp_us_fl']);
});

test('US customer search can isolate a state without changing the national dataset', () => {
  const result = searchUsCustomerRows(rows, { state: 'FL', fullAccess: true });
  assert.equal(result.region_code, 'FL');
  assert.equal(result.total, 1);
  assert.equal(result.rows[0].stable_id, 'opp_us_fl');
});

test('US preview search redacts source and application routes', () => {
  const result = searchUsCustomerRows(rows, { q: 'Austin', fullAccess: false });
  assert.equal(result.total, 1);
  assert.equal(result.rows[0].locked, true);
  assert.equal(result.rows[0].source_url, '');
  assert.equal(result.rows[0].application_url, '');
});

test('US subscriber search keeps source and application routes', () => {
  const result = searchUsCustomerRows(rows, { category: 'craft', fullAccess: true });
  assert.equal(result.total, 2);
  assert.ok(result.rows.some(row => row.stable_id === 'opp_us_b'));
  assert.ok(result.rows.some(row => row.stable_id === 'opp_us_fl'));
});

test('US ZIP radius search remains fail-closed to the proven Texas resolver', () => {
  const result = searchUsCustomerRows(rows, { zip: '78701', radius_miles: 25, fullAccess: true });
  assert.equal(result.total, 1);
  assert.equal(result.rows[0].stable_id, 'opp_us_a');
  assert.ok(result.rows[0].distance_miles < 2);
});

test('unknown US ZIP fails closed for radius filtering without external lookup', () => {
  const result = searchUsCustomerRows(rows, { zip: '78702', radius_miles: 25, fullAccess: true });
  assert.equal(result.total, 0);
});
