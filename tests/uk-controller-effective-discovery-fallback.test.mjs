import assert from 'node:assert/strict';
import test from 'node:test';

import { runUkDiscoveryWithEffectiveFallback } from '../operations/cloudflare-global-acquisition/lib/uk-source-discovery-workflow.mjs';

const NOW = '2026-09-14T13:40:00.000Z';

async function fetchCandidate(result, plan) {
  const council = result.url.includes('.gov.uk/');
  const nonActionablePrivate = result.url.endsWith('/about');
  return {
    result,
    plan,
    fetch_status: 'fetched',
    final_url: result.url,
    page_text: council
      ? 'England market. Applications open. Apply to trade at our market. Trader pitches are available.'
      : nonActionablePrivate
        ? 'United Kingdom artisan market. Independent makers, food and community events.'
        : 'United Kingdom artisan market. Become a trader and apply for a market stall.'
  };
}

test('UK controller uses Serper batch when direct graph returns links but no auto-approved source', async () => {
  let searchCalls = 0;
  const discovery = await runUkDiscoveryWithEffectiveFallback({ SERPER_API_KEY: 'fixture' }, {
    seed_routes: ['https://trusted-market.co.uk/traders'],
    query_offset: 12,
    query_limit: 1,
    results_per_query: 1,
    candidate_limit: 5,
    serper_fallback: true,
    as_of: NOW
  }, {
    directDiscovery: async seeds => ({
      seed_count: seeds.length,
      candidates: seeds.length ? [{
        query: 'cloudflare-first-party-graph',
        rank: 1,
        title: 'Private artisan market information',
        url: 'https://new-private-market.co.uk/about',
        snippet: 'Independent makers, food and community events in the UK.'
      }] : []
    }),
    search: async (_env, query) => {
      searchCalls += 1;
      return [{
        query,
        rank: 1,
        title: 'Example Borough Council market - apply to trade',
        url: 'https://example-borough.gov.uk/markets/apply-to-trade',
        snippet: 'Apply to trade at our market in England.'
      }];
    },
    fetchCandidate
  });

  assert.equal(searchCalls, 1);
  assert.equal(discovery.serper_fallback_used, true);
  assert.equal(discovery.serper_credits_used, 1);
  assert.equal(discovery.query_count, 1);
  assert.equal(discovery.direct_candidates_found, 1);
  assert.equal(discovery.auto_approved_count, 1);
  assert.equal(discovery.approved_candidates[0].canonical_host, 'example-borough.gov.uk');
  assert.match(discovery.discovery_network, /cloudflare_direct_fetch\+serper_fallback/);
});

test('UK controller falls back to Serper when a direct-graph source lacks customer-facing geography', async () => {
  let searchCalls = 0;
  const discovery = await runUkDiscoveryWithEffectiveFallback({}, {
    seed_routes: ['https://known-council.gov.uk/markets'],
    query_offset: 20,
    query_limit: 4,
    candidate_limit: 5,
    serper_fallback: true,
    as_of: NOW
  }, {
    directDiscovery: async seeds => ({
      seed_count: seeds.length,
      candidates: [{
        query: 'cloudflare-first-party-graph',
        rank: 1,
        title: 'Apply for a market stall',
        url: 'https://new-council.gov.uk/markets/apply',
        snippet: 'Apply to trade at our market in England.'
      }]
    }),
    search: async (_env, query) => {
      searchCalls += 1;
      return [{
        query,
        rank: 1,
        title: 'Example Borough Council market - apply to trade',
        url: 'https://example-borough.gov.uk/markets/apply-to-trade',
        snippet: 'Apply to trade at our market in England.'
      }];
    },
    fetchCandidate
  });

  assert.equal(searchCalls, 4);
  assert.equal(discovery.serper_fallback_used, true);
  assert.equal(discovery.serper_credits_used, 4);
  assert.equal(discovery.auto_approved_count, 1);
  assert.equal(discovery.approved_candidates[0].canonical_host, 'example-borough.gov.uk');
  assert.match(discovery.discovery_network, /cloudflare_direct_fetch\+serper_fallback/);
});
