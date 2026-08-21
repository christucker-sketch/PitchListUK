const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  daysSince,
  freshness,
  searchOpportunities,
  freshnessReviewQueue
} = require('../lib/opportunity-database');

function tempRoot(csv) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pitchlist-db-'));
  fs.mkdirSync(path.join(root, 'data'));
  fs.writeFileSync(path.join(root, 'data/events-active.csv'), csv);
  return root;
}

test('classifies opportunity freshness from last checked date', () => {
  const now = new Date('2026-07-07T12:00:00Z');
  assert.equal(daysSince('2026-07-01', now), 6);
  assert.deepEqual(freshness({ last_checked: '2026-07-01' }, now), { status: 'fresh', age_days: 6 });
  assert.deepEqual(freshness({ last_checked: '2026-06-10' }, now), { status: 'aging', age_days: 27 });
  assert.deepEqual(freshness({ last_checked: '2026-05-01' }, now), { status: 'stale', age_days: 67 });
  assert.deepEqual(freshness({ last_checked: '' }, now), { status: 'unknown', age_days: null });
});

test('searches active opportunities by text, county, category, confidence and freshness', () => {
  const root = tempRoot(`event_name,organiser,source_url,application_url,contact_email,location,region,event_start,event_end,application_deadline,stall_fee,vendor_categories,last_checked,confidence,notes,lifecycle_status
Horsham Food Market,Horsham Markets,https://example.com/source,https://example.com/app,,Horsham,West Sussex,2026-08-01,2026-08-01,,£50,street food; hot food,2026-07-01,high,Outdoor food market,active
Cambridge Craft Fair,Cambridge Events,https://example.com/craft,https://example.com/craft/app,,Cambridge,Cambridgeshire,2026-09-01,2026-09-01,,£25,craft; gifts,2026-05-01,medium,Indoor fair,active
`);
  const result = searchOpportunities(root, {
    q: 'horsham',
    county: 'West Sussex',
    category: 'street food',
    confidence: 'high',
    freshness: 'fresh'
  }, new Date('2026-07-07T12:00:00Z'));

  assert.equal(result.total, 2);
  assert.equal(result.count, 1);
  assert.equal(result.rows[0].event_name, 'Horsham Food Market');
  assert.equal(result.rows[0].county, 'West Sussex');
  assert.equal(result.rows[0].freshness_status, 'fresh');
  assert.equal(result.postcode_distance_ready, false);
});

test('filters market views by country, jurisdiction, currency and domain', () => {
  const root = tempRoot(`event_name,organiser,source_url,application_url,contact_email,location,region,event_start,event_end,application_deadline,stall_fee,vendor_categories,last_checked,confidence,notes,lifecycle_status,country,jurisdiction,currency,market_domain
Dublin Food Market,Dublin Org,https://example.ie/source,https://example.ie/app,,Dublin,Ireland - Dublin,2026-08-01,2026-08-01,,EUR 50,street food,2026-07-01,high,ROI row,active,Ireland,IE,EUR,pitchlist.ie
Belfast Food Market,Belfast Org,https://example.co.uk/source,https://example.co.uk/app,,Belfast,Northern Ireland,2026-08-01,2026-08-01,,£50,street food,2026-07-01,high,NI row,active,United Kingdom,GB-NIR,GBP,pitchlist.uk
London Food Market,London Org,https://example.co.uk/london,https://example.co.uk/london/app,,London,London,2026-08-01,2026-08-01,,£50,street food,2026-07-01,high,UK row,active,United Kingdom,GB,GBP,pitchlist.uk
`);

  const republic = searchOpportunities(root, { audience: 'customer', market_domain: 'pitchlist.ie', currency: 'EUR' }, new Date('2026-07-07T12:00:00Z'));
  assert.deepEqual(republic.rows.map(r => r.event_name), ['Dublin Food Market']);

  const northern = searchOpportunities(root, { audience: 'customer', jurisdiction: 'GB-NIR' }, new Date('2026-07-07T12:00:00Z'));
  assert.deepEqual(northern.rows.map(r => r.event_name), ['Belfast Food Market']);

  const ukStore = searchOpportunities(root, { audience: 'customer', market_domain: 'pitchlist.uk', currency: 'GBP' }, new Date('2026-07-07T12:00:00Z'));
  assert.deepEqual(ukStore.rows.map(r => r.event_name), ['Belfast Food Market', 'London Food Market']);
  assert.deepEqual(ukStore.facets.currencies, ['EUR', 'GBP']);
});

test('customer audience hides stale and unknown rows unless explicitly included', () => {
  const root = tempRoot(`event_name,organiser,source_url,application_url,contact_email,location,region,event_start,event_end,application_deadline,stall_fee,vendor_categories,last_checked,confidence,notes,lifecycle_status
Fresh Food Market,Fresh Org,https://example.com/fresh,https://example.com/fresh/app,,Leeds,Yorkshire & The Humber,2026-08-01,2026-08-01,,£50,street food,2026-07-01,high,Fresh row,active
Stale Food Market,Stale Org,https://example.com/stale,https://example.com/stale/app,,Leeds,Yorkshire & The Humber,2026-08-02,2026-08-02,,£50,street food,2026-05-01,high,Stale row,active
Unknown Food Market,Unknown Org,https://example.com/unknown,https://example.com/unknown/app,,Leeds,Yorkshire & The Humber,2026-08-03,2026-08-03,,£50,street food,,medium,Unknown row,active
`);

  const customer = searchOpportunities(root, { audience: 'customer', category: 'food' }, new Date('2026-07-07T12:00:00Z'));
  assert.deepEqual(customer.rows.map(r => r.event_name), ['Fresh Food Market']);

  const withStale = searchOpportunities(root, { audience: 'customer', include_stale: 'true', category: 'food' }, new Date('2026-07-07T12:00:00Z'));
  assert.equal(withStale.count, 3);
});

test('search and freshness queue exclude expired lifecycle rows by default', () => {
  const root = tempRoot(`event_name,organiser,source_url,application_url,contact_email,location,region,event_start,event_end,application_deadline,stall_fee,vendor_categories,last_checked,confidence,notes,lifecycle_status
Expired Fresh Market,Expired Org,https://example.com/expired,https://example.com/expired/app,,Leeds,Yorkshire & The Humber,2026-08-01,2026-08-01,,£50,street food,2026-07-01,high,Expired row,expired
Stale Food Market,Stale Org,https://example.com/stale,https://example.com/stale/app,,Leeds,Yorkshire & The Humber,2026-08-02,2026-08-02,,£50,street food,2026-05-01,high,Stale row,active
`);

  const search = searchOpportunities(root, { include_stale: true, category: 'food' }, new Date('2026-07-07T12:00:00Z'));
  assert.deepEqual(search.rows.map(r => r.event_name), ['Stale Food Market']);

  const queue = freshnessReviewQueue(root, {}, new Date('2026-07-07T12:00:00Z'));
  assert.deepEqual(queue.rows.map(r => r.event_name), ['Stale Food Market']);

  const withExpired = searchOpportunities(root, { include_expired: true, include_stale: true, category: 'food' }, new Date('2026-07-07T12:00:00Z'));
  assert.equal(withExpired.count, 2);
});

test('filters and sorts by approximate radius when origin is supplied', () => {
  const root = tempRoot(`event_name,organiser,source_url,application_url,contact_email,location,region,event_start,event_end,application_deadline,stall_fee,vendor_categories,last_checked,confidence,notes,lifecycle_status
Leeds Food Market,Leeds Org,https://example.com/leeds,https://example.com/leeds/app,,Leeds,West Yorkshire,2026-08-01,2026-08-01,,£50,street food,2026-07-01,high,Fresh row,active
London Food Market,London Org,https://example.com/london,https://example.com/london/app,,London,London,2026-08-02,2026-08-02,,£50,street food,2026-07-01,high,Fresh row,active
`);

  const result = searchOpportunities(root, {
    audience: 'customer',
    category: 'food',
    radius_miles: 30,
    origin: { latitude: 53.8008, longitude: -1.5491 }
  }, new Date('2026-07-07T12:00:00Z'));

  assert.equal(result.postcode_distance_ready, true);
  assert.deepEqual(result.rows.map(r => r.event_name), ['Leeds Food Market']);
  assert.equal(result.rows[0].distance_miles, 0);
});

test('builds freshness review queue with stale and unknown rows first', () => {
  const root = tempRoot(`event_name,organiser,source_url,application_url,contact_email,location,region,event_start,event_end,application_deadline,stall_fee,vendor_categories,last_checked,confidence,notes,lifecycle_status
Fresh Food Market,Fresh Org,https://example.com/fresh,https://example.com/fresh/app,,Leeds,Yorkshire & The Humber,2026-08-01,2026-08-01,,£50,street food,2026-07-01,high,Fresh row,active
Stale Food Market,Stale Org,https://example.com/stale,https://example.com/stale/app,,Leeds,Yorkshire & The Humber,2026-08-02,2026-08-02,,£50,street food,2026-05-01,high,Stale row,active
Unknown Food Market,Unknown Org,https://example.com/unknown,https://example.com/unknown/app,,Leeds,Yorkshire & The Humber,2026-08-03,2026-08-03,,£50,street food,,medium,Unknown row,active
`);

  const queue = freshnessReviewQueue(root, {}, new Date('2026-07-07T12:00:00Z'));
  assert.equal(queue.needs_review, 2);
  assert.equal(queue.summary.fresh, 1);
  assert.equal(queue.summary.stale, 1);
  assert.equal(queue.summary.unknown, 1);
  assert.equal(queue.rows[0].event_name, 'Stale Food Market');
});
