import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isCanadaCustomerSearchPublic,
  onRequestGet,
  parseCaSearchOptions,
  resolveCaAccess
} from '../functions/api/ca-customer-opportunities/search.js';

test('Canada API adapter maps only Canada search parameters', () => {
  const url = new URL('https://example.test/api/ca-customer-opportunities/search?province=ON&q=food&category=food%20vendor&limit=20&offset=5');
  assert.deepEqual(parseCaSearchOptions(url, true), {
    fullAccess: true,
    q: 'food',
    category: 'food vendor',
    province: 'ON',
    limit: '20',
    offset: '5'
  });
});

test('Canada API accepts territory and region_code aliases for the province-or-territory filter', () => {
  const territory = new URL('https://example.test/api/ca-customer-opportunities/search?territory=YT');
  const region = new URL('https://example.test/api/ca-customer-opportunities/search?region_code=BC');
  assert.equal(parseCaSearchOptions(territory, false).province, 'YT');
  assert.equal(parseCaSearchOptions(region, false).province, 'BC');
});

test('Canada customer launch flag is fail-closed and requires exact true', () => {
  assert.equal(isCanadaCustomerSearchPublic({}), false);
  assert.equal(isCanadaCustomerSearchPublic({ CA_CUSTOMER_SEARCH_PUBLIC_ENABLED: 'false' }), false);
  assert.equal(isCanadaCustomerSearchPublic({ CA_CUSTOMER_SEARCH_PUBLIC_ENABLED: '1' }), false);
  assert.equal(isCanadaCustomerSearchPublic({ CA_CUSTOMER_SEARCH_PUBLIC_ENABLED: 'yes' }), false);
  assert.equal(isCanadaCustomerSearchPublic({ CA_CUSTOMER_SEARCH_PUBLIC_ENABLED: 'true' }), true);
});

test('Canada API is indistinguishable from an absent route before launch', async () => {
  const request = new Request('https://example.test/api/ca-customer-opportunities/search');
  const response = await onRequestGet({ request, env: {} });
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'Not found' });
});

test('Canada API defaults to preview without subscriber entitlement after launch', async () => {
  const request = new Request('https://example.test/api/ca-customer-opportunities/search');
  const access = await resolveCaAccess(request, {}, new URL(request.url));
  assert.equal(access.mode, 'preview');
  assert.equal(access.reason, 'not_subscribed');
});

test('Canada API honours the existing explicit full-access switch after launch', async () => {
  const request = new Request('https://example.test/api/ca-customer-opportunities/search');
  const access = await resolveCaAccess(request, { PITCHLIST_DATABASE_PUBLIC_FULL_ACCESS: 'true' }, new URL(request.url));
  assert.equal(access.mode, 'subscriber');
  assert.equal(access.reason, 'public_full_access');
});

test('Canada API can expose only the dedicated Canada snapshot when explicitly launched', async () => {
  const request = new Request('https://example.test/api/ca-customer-opportunities/search?limit=250');
  const response = await onRequestGet({
    request,
    env: { CA_CUSTOMER_SEARCH_PUBLIC_ENABLED: 'true' }
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.country_code, 'CA');
  assert.equal(body.region_code, null);
  assert.equal(body.market_domain, 'findpitches.com');
  assert.equal(body.currency, 'CAD');
  assert.equal(body.access_mode, 'preview');
  assert.ok(body.rows.every(row => row.country === 'Canada' && /^CA-[A-Z]{2}$/.test(row.jurisdiction)));
  assert.ok(body.rows.every(row => row.currency === 'CAD'));
  assert.ok(body.rows.every(row => row.publishable === true && row.quality_status === 'customer_ready'));
  assert.ok(body.rows.every(row => row.source_url === '' && row.application_url === ''));
});
