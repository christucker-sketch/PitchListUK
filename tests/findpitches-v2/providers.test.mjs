import test from 'node:test';
import assert from 'node:assert/strict';

import { createSerperSearchProvider } from '../../platform/findpitches-v2/providers/search/serper.mjs';
import { createHttpFetchProvider } from '../../platform/findpitches-v2/providers/fetch/http.mjs';
import { getMarket } from '../../platform/findpitches-v2/markets/registry.mjs';

test('Serper provider uses market configuration without market-specific code paths', async () => {
  const calls = [];
  const provider = createSerperSearchProvider({
    apiKey: 'test-key',
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({
        organic: [{ link: 'https://example.test/apply', title: 'Apply', snippet: 'Vendors wanted', position: 1 }]
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  });

  for (const code of ['GB', 'US', 'CA']) {
    const results = await provider.search({ market: getMarket(code), query: 'vendors wanted' });
    assert.equal(results.length, 1);
  }

  assert.deepEqual(
    calls.map(call => JSON.parse(call.init.body).gl),
    ['gb', 'us', 'ca']
  );
});

test('HTTP provider rejects unsupported content types', async () => {
  const provider = createHttpFetchProvider({
    fetchImpl: async () => new Response('pdf', {
      status: 200,
      headers: { 'content-type': 'application/pdf' }
    })
  });

  await assert.rejects(
    () => provider.fetch('https://example.test/file.pdf'),
    /findpitches_v2_fetch_content_type_unsupported/
  );
});
