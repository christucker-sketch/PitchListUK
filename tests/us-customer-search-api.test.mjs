import test from 'node:test';
import assert from 'node:assert/strict';

import { onRequestGet, parseUsSearchOptions, resolveUsAccess } from '../functions/api/us-customer-opportunities/search.js';

test('US API adapter maps only US search parameters', () => {
  const url = new URL('https://example.test/api/us-customer-opportunities/search?zip=78701&radius=25&q=food&category=food%20truck&limit=20&offset=5&state=TX');
  assert.deepEqual(parseUsSearchOptions(url, true), {
    fullAccess: true,
    q: 'food',
    category: 'food truck',
    state: 'TX',
    zip: '78701',
    radius_miles: '25',
    limit: '20',
    offset: '5'
  });
});

test('US API adapter defaults to preview without subscriber entitlement', async () => {
  const request = new Request('https://example.test/api/us-customer-opportunities/search');
  const access = await resolveUsAccess(request, {}, new URL(request.url));
  assert.equal(access.mode, 'preview');
  assert.equal(access.reason, 'not_subscribed');
});

test('US API adapter honours the existing explicit full-access switch', async () => {
  const request = new Request('https://example.test/api/us-customer-opportunities/search');
  const access = await resolveUsAccess(request, { PITCHLIST_DATABASE_PUBLIC_FULL_ACCESS: 'true' }, new URL(request.url));
  assert.equal(access.mode, 'subscriber');
  assert.equal(access.reason, 'public_full_access');
});

test('US API reads the national production snapshot but cannot leak GB rows', async () => {
  const request = new Request('https://example.test/api/us-customer-opportunities/search?limit=250');
  const response = await onRequestGet({ request, env: {} });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.country_code, 'US');
  assert.equal(body.region_code, null);
  assert.equal(body.market_domain, 'findpitches.com');
  assert.equal(body.currency, 'USD');
  assert.ok(body.rows.every(row => row.country_code === 'US' && /^US-[A-Z]{2}$/.test(row.jurisdiction)));
  assert.ok(body.rows.every(row => row.publishable === true && row.quality_status === 'customer_ready'));
  assert.ok(body.rows.every(row => row.source_url === '' && row.application_url === ''));
});

test('US API accepts an explicit state filter', () => {
  const url = new URL('https://example.test/api/us-customer-opportunities/search?region_code=FL');
  assert.equal(parseUsSearchOptions(url, false).state, 'FL');
});
