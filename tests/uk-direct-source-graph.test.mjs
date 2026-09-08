import assert from 'node:assert/strict';
import test from 'node:test';

import { discoverUkDirectSourceGraph } from '../operations/cloudflare-global-acquisition/lib/uk-direct-source-graph.mjs';

test('UK direct source graph rejects supporting-document follow-on forms', async () => {
  const seed = 'https://www.barnsley.gov.uk/services/markets/trade-at-our-local-markets/';
  const html = `
    <a href="https://my.barnsley.gov.uk/form/Apply-to-trade-at-a-local-market/page-1">Apply to trade at a local market</a>
    <a href="https://my.barnsley.gov.uk/form/Upload-supporting-documents-to-trade-at-a-local-market/page-1">Upload supporting documents</a>
  `;
  const fetchImpl = async url => ({
    ok: true,
    text: async () => String(url).includes('sitemap') ? '<urlset></urlset>' : html
  });

  const result = await discoverUkDirectSourceGraph([seed], {
    fetchImpl,
    max_seeds: 1,
    max_links: 10,
    timeout_ms: 1000
  });

  assert.deepEqual(result.candidates.map(item => item.url), [
    'https://my.barnsley.gov.uk/form/Apply-to-trade-at-a-local-market/page-1'
  ]);
  assert.equal(result.external_search_credits, 0);
});
