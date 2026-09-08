import assert from 'node:assert/strict';
import test from 'node:test';

import {
  handleInternalSerperRequest,
  isInternalSerperRequest,
  validateInternalSerperPayload
} from '../operations/cloudflare-texas-acquisition/src/internal-serper-broker.js';
import { searchViaSerperBroker } from '../operations/cloudflare-global-acquisition/lib/service-serper-search.mjs';

const INTERNAL_URL = 'https://findpitches-serper.internal/search';
const INTERNAL_HEADERS = {
  'content-type': 'application/json',
  'x-findpitches-internal-service': 'findpitches-service-binding-v1'
};

test('internal Serper broker rejects ordinary public Worker requests', () => {
  const publicRequest = new Request('https://pitchlist-texas-acquisition.example.workers.dev/search', {
    method: 'POST', headers: INTERNAL_HEADERS
  });
  assert.equal(isInternalSerperRequest(publicRequest), false);
});

test('internal Serper payload is UK-only and bounded', () => {
  const payload = validateInternalSerperPayload({ q: 'London market traders apply', num: 999, gl: 'us' });
  assert.equal(payload.q, 'London market traders apply');
  assert.equal(payload.num, 8);
  assert.equal(payload.gl, 'uk');
  assert.equal(payload.hl, 'en');
  assert.throws(() => validateInternalSerperPayload({ q: '' }), /query_invalid/);
});

test('internal broker uses its own Serper secret and returns only compact organic results', async () => {
  const request = new Request(INTERNAL_URL, {
    method: 'POST', headers: INTERNAL_HEADERS, body: JSON.stringify({ q: 'London markets', num: 2 })
  });
  let outbound;
  const response = await handleInternalSerperRequest(request, { SERPER_API_KEY: 'worker-secret' }, {
    fetchImpl: async (url, init) => {
      outbound = { url, init };
      return Response.json({ organic: [
        { title: 'Council traders', link: 'https://example.gov.uk/traders', snippet: 'Apply to trade' },
        { title: 'Market', link: 'https://market.co.uk/apply', snippet: 'Become a trader' }
      ] });
    }
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.results.length, 2);
  assert.equal(outbound.url, 'https://google.serper.dev/search');
  assert.equal(outbound.init.headers['X-API-KEY'], 'worker-secret');
  assert.deepEqual(JSON.parse(outbound.init.body), { q: 'London markets', num: 2, gl: 'uk', hl: 'en' });
});

test('global discovery client calls only the service binding and never needs a Serper secret', async () => {
  let received;
  const env = {
    SERPER_BROKER: {
      async fetch(request) {
        received = request;
        return Response.json({ ok: true, results: [
          { rank: 1, title: 'Council market', link: 'https://example.gov.uk/market', snippet: 'Apply' }
        ] });
      }
    }
  };
  const results = await searchViaSerperBroker(env, 'London council markets', { num: 4 });
  assert.equal(received.url, INTERNAL_URL);
  assert.equal(received.headers.get('x-findpitches-internal-service'), 'findpitches-service-binding-v1');
  assert.deepEqual(await received.clone().json(), { q: 'London council markets', num: 4 });
  assert.equal(results[0].url, 'https://example.gov.uk/market');
  assert.equal(results[0].query, 'London council markets');
});
