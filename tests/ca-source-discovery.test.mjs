import assert from 'node:assert/strict';
import test from 'node:test';

import { runCanadaSourceDiscovery } from '../operations/cloudflare-global-acquisition/lib/ca-source-discovery.mjs';

test('Canada discovery searches bounded opportunity-first plans and approves verified first-party organisers', async () => {
  const searched = [];
  const result = await runCanadaSourceDiscovery({}, {
    query_offset: 60,
    query_limit: 1,
    results_per_query: 8,
    as_of: '2026-09-13T15:30:00.000Z'
  }, {
    search: async (query, num) => {
      searched.push({ query, num });
      return [
        { title: 'Ontario Market Vendor Application', link: 'https://www.ontario.ca/page/market-vendors', snippet: 'Ontario market vendors can apply' },
        { title: 'Private Ontario Market Vendor Application', link: 'https://examplemarket.ca/vendors', snippet: 'Ontario market vendor registration' }
      ];
    },
    fetchCandidate: async url => ({
      url,
      text: url.includes('ontario.ca')
        ? 'Ontario market vendors can apply using the application form. Vendor fee and registration deadline.'
        : 'Ontario market vendors can apply for a booth using the registration form.'
    })
  });

  assert.equal(searched.length, 1);
  assert.match(searched[0].query, /Ontario/);
  assert.equal(result.country, 'CA');
  assert.equal(result.query_offset, 60);
  assert.equal(result.next_query_offset, 61);
  assert.equal(result.approved_source_count, 2);
  assert.equal(result.deterministic_first_party_count, 1);
  assert.equal(result.public_service_count, 1);
  assert.equal(result.manual_review_count, 0);
  assert.equal(result.held_count, 0);
  assert.ok(result.approved_sources.every(source => source.country_code === 'CA'));
  assert.ok(result.approved_sources.every(source => source.region_code === 'ON'));
  assert.ok(result.approved_sources.every(source => source.jurisdiction === 'CA-ON'));
  assert.ok(result.approved_sources.every(source => /^ca-on-[a-f0-9]{12}$/.test(source.id)));
  assert.equal(result.source_registry_write_attempted, false);
  assert.equal(result.production_opportunity_write_attempted, false);
  assert.equal(result.growth_health, 'productive');
});

test('Canada discovery holds fetch failures and advances the exact plan offset with wrap', async () => {
  const result = await runCanadaSourceDiscovery({}, { query_offset: 129, query_limit: 4 }, {
    search: async () => [{ title: 'Yukon Market Vendor Application', link: 'https://yukon.ca/vendor', snippet: 'Yukon market vendor application' }],
    fetchCandidate: async () => { throw new Error('fetch_failed'); }
  });
  assert.equal(result.query_count, 4);
  assert.equal(result.next_query_offset, 3);
  assert.equal(result.approved_source_count, 0);
  assert.equal(result.held_count, 1);
  assert.equal(result.held[0].reason, 'fetch_failed');
});

test('Canada discovery deduplicates the same route across multiple queries', async () => {
  const result = await runCanadaSourceDiscovery({}, { query_offset: 60, query_limit: 2 }, {
    search: async () => [{ title: 'Ontario Market Vendor Application', link: 'https://ontario.ca/vendors', snippet: 'Ontario market vendor application' }],
    fetchCandidate: async url => ({ url, text: 'Ontario market vendors can apply. Application form, vendor fee and deadline.' })
  });
  assert.equal(result.search_candidates, 1);
  assert.equal(result.unique_routes_considered, 1);
  assert.equal(result.approved_source_count, 1);
  assert.equal(result.serper_credits_used, 2);
});