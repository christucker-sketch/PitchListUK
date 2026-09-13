import test from 'node:test';
import assert from 'node:assert/strict';

import { isCanadaCustomerSurfacePublic, onRequest } from '../functions/_middleware.js';

function context(path, env = {}) {
  return {
    request: new Request(`https://findpitches.com${path}`),
    env: {
      ...env,
      ASSETS: {
        async fetch(url) {
          return new Response(`asset:${new URL(url).pathname}`, { status: 200 });
        }
      }
    },
    async next() {
      return new Response('next', { status: 200 });
    }
  };
}

test('Canada customer surface launch flag is fail-closed and exact', () => {
  assert.equal(isCanadaCustomerSurfacePublic({}), false);
  assert.equal(isCanadaCustomerSurfacePublic({ CA_CUSTOMER_SEARCH_PUBLIC_ENABLED: 'false' }), false);
  assert.equal(isCanadaCustomerSurfacePublic({ CA_CUSTOMER_SEARCH_PUBLIC_ENABLED: '1' }), false);
  assert.equal(isCanadaCustomerSurfacePublic({ CA_CUSTOMER_SEARCH_PUBLIC_ENABLED: 'yes' }), false);
  assert.equal(isCanadaCustomerSurfacePublic({ CA_CUSTOMER_SEARCH_PUBLIC_ENABLED: 'true' }), true);
});

test('Canada page and assets all return 404 before customer launch', async () => {
  for (const path of ['/ca', '/ca/', '/ca/find-pitches', '/ca/find-pitches.css', '/ca/find-pitches.js']) {
    const response = await onRequest(context(path));
    assert.equal(response.status, 404, path);
    assert.equal(response.headers.get('x-robots-tag'), 'noindex', path);
  }
});

test('Canada root redirects to the search surface only after explicit launch', async () => {
  const response = await onRequest(context('/ca?province=ON', { CA_CUSTOMER_SEARCH_PUBLIC_ENABLED: 'true' }));
  assert.equal(response.status, 308);
  assert.equal(response.headers.get('location'), 'https://findpitches.com/ca/find-pitches?province=ON');
});

test('Canada search page and assets resolve only after explicit launch', async () => {
  const env = { CA_CUSTOMER_SEARCH_PUBLIC_ENABLED: 'true' };
  for (const path of ['/ca/find-pitches', '/ca/find-pitches/', '/ca/find-pitches.css', '/ca/find-pitches.js']) {
    const response = await onRequest(context(path, env));
    assert.equal(response.status, 200, path);
    const expectedPath = path === '/ca/find-pitches/' ? '/ca/find-pitches' : path;
    assert.equal(await response.text(), `asset:${expectedPath}`, path);
  }
});

test('unknown Canada paths stay fail-closed after launch', async () => {
  const response = await onRequest(context('/ca/admin', { CA_CUSTOMER_SEARCH_PUBLIC_ENABLED: 'true' }));
  assert.equal(response.status, 404);
});

test('Canada API remains delegated to its own independent launch guard', async () => {
  const response = await onRequest(context('/api/ca-customer-opportunities/search'));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'next');
});
