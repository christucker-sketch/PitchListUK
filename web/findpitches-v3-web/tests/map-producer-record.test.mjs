import test from 'node:test';
import assert from 'node:assert/strict';
import { toSiteOpportunity, siteApplication, siteType, siteSells, cleanOrganiser } from '../contract/reference/map-producer-record.mjs';
const T = '2026-10-09';
const rec = (k = {}) => Object.assign({ opportunity_id: 'fdx1_' + 'a'.repeat(20), country_code: 'GB', event_name: 'Faversham Christmas Market',
  organiser: 'UKCraftFairs.com', opportunity_type: 'christmas_market', vendor_categories: ['craft', 'art', 'exhibitor'], application_state: 'ENQUIRY_AVAILABLE',
  event_start: '2026-12-05', event_end: null, recurring: null, application_deadline: null, location: 'Alexander Centre, Faversham, Faversham, Kent',
  locality: 'Faversham', region: 'Kent', region_code: null, source_url: 'https://www.ukcraftfairs.com/craft-events/1/x', application_url: null,
  application_routes: [{ url: 'https://www.ukcraftfairs.com/contact/1' }], source_type: 'platform_listing', discovery_source: 'ukcraftfairs',
  last_checked: '2026-10-08T10:00:00Z', confidence: { level: 'HIGH' } }, k);
test('status comes only from producer evidence', () => {
  assert.equal(siteApplication(rec(), T).status, 'enquire');
  assert.equal(siteApplication(rec({ application_state: 'OPEN_NOW' }), T).status, 'open_now');
  assert.equal(siteApplication(rec({ application_state: 'OPEN_NOW', application_deadline: '2026-10-15' }), T).status, 'closing_soon');
  assert.equal(siteApplication(rec({ application_state: 'OPEN_NOW', application_deadline: '2026-11-30' }), T).status, 'open');
  assert.equal(siteApplication(rec({ application_state: 'ROLLING' }), T).status, 'rolling');
  assert.equal(siteApplication(rec({ application_state: 'UPCOMING_NOT_OPEN', applications_open_on: '2027-02-01' }), T).opens_on, '2027-02-01');
  assert.equal(siteApplication(rec({ event_start: '2026-10-01' }), T).status, 'ended');
  assert.equal(siteApplication(rec({ application_state: 'UNKNOWN' }), T).status, 'unknown');
});
test('types, sells and organiser follow the contract', () => {
  assert.equal(siteType(rec()), 'christmas_market');
  assert.equal(siteType(rec({ country_code: 'US' })), 'holiday_market');
  assert.equal(siteType(rec({ opportunity_type: 'agricultural_show' })), 'show');
  assert.equal(siteType(rec({ opportunity_type: null })), null);
  assert.deepEqual(siteSells(rec()), ['craft']);
  assert.deepEqual(siteSells(rec({ vendor_categories: [] })), []);
  assert.equal(cleanOrganiser('UKCraftFairs.com'), null);
});
test('one record maps to the screen shape, with paid fields kept for server-side redaction', () => {
  const o = toSiteOpportunity(rec(), T);
  assert.equal(o.id, 'fdx1_' + 'a'.repeat(20));
  assert.equal(o.location.label, 'Alexander Centre, Faversham, Kent');
  assert.equal(o.location.lat, null);
  assert.equal(o._restricted.application_url, 'https://www.ukcraftfairs.com/contact/1');
  assert.equal(o._restricted.source_domain, 'ukcraftfairs.com');
  assert.equal(o.checked.last_checked, '2026-10-08');
  assert.equal(toSiteOpportunity(rec({ country_code: 'US', region_code: 'US-TX' }), T).location.region_code, 'TX');
});
