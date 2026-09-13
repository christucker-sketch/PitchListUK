import assert from 'node:assert/strict';
import test from 'node:test';

import { runCanadaSourceDiscovery } from '../operations/cloudflare-global-acquisition/lib/ca-source-discovery.mjs';

test('Canada discovery searches bounded Canadian plans and auto-approves only official evidence', async () => {
  const searched = [];
  const result = await runCanadaSourceDiscovery({}, {
    query_offset: 64,
    query_limit: 1,
    results_per_query: 8,
    as_of: '2026-09-13T15:30:00.000Z'
  }, {
    search: async (query, num) => {
      searched.push({ query, num });
      return [
        { title: 'Ontario Market Vendor Application', link: 'https://www.ontario.ca/page/market-vendors', snippet: 'Ontario vendors can apply' },
        { title: 'Private Ontario Market', link: 'https://examplemarket.ca/vendors', snippet: 'Ontario vendor registration' }
      ];
    },
    fetchCandidate: async url => ({
      url,
      text: url.includes('ontario.ca')
        ? 'Ontario vendors can apply using the application form. Vendor fee and registration deadline.'
        : 'Ontario vendors can apply for a booth using the registration form.'
    })
  });

  assert.equal(searched.length, 1);
  assert.match(searched[0].query, /Ontario/);
  assert.equal(result.country, 'CA');
  assert.equal(result.query_offset, 64);
  assert.equal(result.next_query_offset, 65);
  assert.equal(result.approved_source_count, 1);
  assert.equal(result.manual_review_count, 1);
  assert.equal(result.held_count, 0);
  assert.equal(result.approved_sources[0].country_code, 'CA');
  assert.equal(result.approved_sources[0].region_code, 'ON');
  assert.equal(result.approved_sources[0].jurisdiction, 'CA-ON');
  assert.match(result.approved_sources[0].id, /^ca-on-[a-f0-9]{12}$/);
  assert.equal(result.source_registry_write_attempted, false);
  assert.equal(result.production_opportunity_write_attempted, false);
});

test('Canada discovery holds fetch failures and advances the exact plan offset', async () => {
  const result = await runCanadaSourceDiscovery({}, { query_offset: 103, query_limit: 4 }, {
    search: async () => [{ title: 'Yukon Vendor Application', link: 'https://yukon.ca/vendor', snippet: 'Yukon vendor application' }],
    fetchCandidate: async () => { throw new Error('fetch_failed'); }
  });
  assert.equal(result.query_count, 4);
  assert.equal(result.next_query_offset, 3);
  assert.equal(result.approved_source_count, 0);
  assert.equal(result.held_count, 1);
  assert.equal(result.held[0].reason, 'fetch_failed');
});

test('Canada discovery deduplicates the same route across multiple queries', async () => {
  const result = await runCanadaSourceDiscovery({}, { query_offset: 64, query_limit: 2 }, {
    search: async () => [{ title: 'Ontario Vendor Application', link: 'https://ontario.ca/vendors', snippet: 'Ontario vendor application' }],
    fetchCandidate: async url => ({ url, text: 'Ontario vendors can apply. Application form, vendor fee and deadline.' })
  });
  assert.equal(result.search_candidates, 1);
  assert.equal(result.approved_source_count, 1);
  assert.equal(result.serper_credits_used, 2);
});
