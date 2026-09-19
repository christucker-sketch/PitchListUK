import assert from 'node:assert/strict';
import test from 'node:test';

import sourceDiscoveryLib from '../operations/opportunity-pipeline/acquisition/source-discovery.js';
import { autoApprovePublicServiceCandidates, isUkLiveSourceRouteCandidate, runUkSourceDiscovery, UK_DISCOVERY_TEMPLATES, UK_SOURCE_DISCOVERY_LIMITS } from '../operations/cloudflare-global-acquisition/lib/uk-source-discovery.mjs';
import { planUkSourceRegistry, ukSourceBranchName } from '../operations/cloudflare-global-acquisition/lib/uk-source-publication.mjs';

const { discoveryQueries } = sourceDiscoveryLib;
const NOW = '2026-09-08T17:30:00.000Z';

function searchFixture() {
  return async (_env, query) => [
    {
      query,
      rank: 1,
      title: 'Example Borough Council markets - apply to trade',
      url: 'https://example-borough.gov.uk/markets/apply-to-trade',
      snippet: 'Apply to trade at our markets in England.'
    },
    {
      query,
      rank: 2,
      title: 'Example Artisan Market - become a trader',
      url: 'https://example-artisan-market.co.uk/become-a-trader',
      snippet: 'Become a trader at our UK artisan market.'
    }
  ];
}

async function fetchFixture(result, plan) {
  const isCouncil = result.url.includes('.gov.uk/');
  return {
    result,
    plan,
    fetch_status: 'fetched',
    final_url: result.url,
    page_text: isCouncil
      ? 'England market. Apply to trade at our market. Trader applications are open and pitches are available.'
      : 'United Kingdom artisan market. Become a trader and apply for a market stall.'
  };
}

test('UK rapid discovery plan targets eight high-yield public-service application routes per region', () => {
  assert.equal(UK_DISCOVERY_TEMPLATES.length, 8);
  const plans = discoveryQueries({ regions: ['Yorkshire'], templates: UK_DISCOVERY_TEMPLATES, limit: 8, offset: 0 });
  assert.equal(plans.length, 8);
  assert.equal(new Set(plans.map(item => item.template_id)).size, 8);
  for (const plan of plans) assert.match(plan.query, /site:\.gov\.uk/i);
  assert.ok(plans.some(item => /apply to trade/i.test(item.query)));
  assert.ok(plans.some(item => /market stall/i.test(item.query)));
  assert.ok(plans.some(item => /event trader/i.test(item.query)));
  assert.ok(plans.some(item => /food vendor/i.test(item.query)));
  assert.ok(plans.some(item => /concession pitch/i.test(item.query)));
});

test('UK discovery is bounded and auto-approves only deterministic public-service sources', async () => {
  const discovery = await runUkSourceDiscovery({ SERPER_API_KEY: 'fixture' }, {
    query_limit: 1,
    results_per_query: 2,
    candidate_limit: 5,
    as_of: NOW
  }, {
    search: searchFixture(),
    fetchCandidate: fetchFixture
  });

  assert.equal(discovery.query_count, 1);
  assert.equal(discovery.serper_credits_used, 1);
  assert.equal(discovery.serper_fallback_used, true);
  assert.equal(discovery.candidates_classified, 2);
  assert.equal(discovery.auto_approved_count, 1);
  assert.equal(discovery.manual_review_count, 1);
  assert.equal(discovery.approved_candidates[0].canonical_host, 'example-borough.gov.uk');
  assert.equal(discovery.approved_candidates[0].approval_status, 'approved');
  assert.equal(discovery.review_queue[0].canonical_host, 'example-artisan-market.co.uk');
  assert.equal(discovery.review_queue[0].approval_status, 'pending');
  assert.equal(discovery.production_opportunity_write_attempted, false);
  assert.equal(discovery.source_registry_write_attempted, false);
  assert.equal(UK_SOURCE_DISCOVERY_LIMITS.maximum_query_limit, 12);
  assert.equal(UK_SOURCE_DISCOVERY_LIMITS.maximum_results_per_query, 8);
  assert.equal(UK_SOURCE_DISCOVERY_LIMITS.maximum_candidate_limit, 50);
});

test('UK direct graph keeps placeholder-geography candidates unapproved without spending Serper inside the low-level pass', async () => {
  let searchCalled = false;
  const discovery = await runUkSourceDiscovery({}, {
    seed_routes: ['https://known-council.gov.uk/markets'],
    query_limit: 4,
    candidate_limit: 5,
    as_of: NOW
  }, {
    directDiscovery: async () => ({
      seed_count: 1,
      candidates: [{
        query: 'cloudflare-first-party-graph',
        rank: 1,
        title: 'Apply for a market stall',
        url: 'https://known-council.gov.uk/markets/apply',
        snippet: 'Cloudflare direct link discovery'
      }]
    }),
    search: async () => { searchCalled = true; throw new Error('Serper should not be called'); },
    fetchCandidate: fetchFixture
  });

  assert.equal(searchCalled, false);
  assert.equal(discovery.discovery_network, 'cloudflare_direct_fetch');
  assert.equal(discovery.direct_seed_count, 1);
  assert.equal(discovery.direct_candidates_found, 1);
  assert.equal(discovery.serper_fallback_used, false);
  assert.equal(discovery.serper_credits_used, 0);
  assert.equal(discovery.query_count, 0);
  assert.equal(discovery.auto_approved_count, 0);
});

test('UK source promotion plan is additions-only and deterministic', async () => {
  const discovery = await runUkSourceDiscovery({ SERPER_API_KEY: 'fixture' }, {
    query_limit: 1,
    results_per_query: 2,
    candidate_limit: 5,
    as_of: NOW
  }, {
    search: searchFixture(),
    fetchCandidate: fetchFixture
  });
  const base = {
    mainSha: 'a'.repeat(40),
    fileSha: 'b'.repeat(40),
    registry_path: 'operations/opportunity-pipeline/config/approved-source-routes.json',
    registry: []
  };
  const plan = planUkSourceRegistry(base, discovery.approved_candidates, { generated_at: NOW });
  assert.equal(plan.summary.before_count, 0);
  assert.equal(plan.summary.additions, 1);
  assert.equal(plan.summary.after_count, 1);
  assert.equal(plan.summary.removals, 0);
  assert.equal(plan.registry[0].host, 'example-borough.gov.uk');
  assert.equal(plan.registry[0].terms_policy, 'public-service');
  assert.equal(plan.registry[0].approval_decision, 'approved_unambiguous_public_service_first_party');
  assert.match(ukSourceBranchName(plan, base.mainSha), /^sources\/cloud-uk-growth-[a-f0-9]{16}-base-a{16}$/);
});

test('UK source promotion returns clean zero growth with no approved candidates', () => {
  const base = { mainSha: 'c'.repeat(40), registry_path: 'operations/opportunity-pipeline/config/approved-source-routes.json', registry: [{ official_application_route: 'https://existing.gov.uk/market' }] };
  const plan = planUkSourceRegistry(base, [], { generated_at: NOW });
  assert.equal(plan.manifest, null);
  assert.equal(plan.summary.additions, 0);
  assert.equal(plan.summary.after_count, 1);
  assert.equal(plan.registry, base.registry);
});

test('UK deterministic approval rejects central guidance and careers profiles', () => {
  assert.equal(isUkLiveSourceRouteCandidate('https://gov.uk/guidance/internal-market-scheme'), false);
  assert.equal(isUkLiveSourceRouteCandidate('https://nationalcareers.service.gov.uk/job-profiles/market-trader'), false);
  assert.equal(isUkLiveSourceRouteCandidate('https://example.gov.uk/markets/apply'), true);
  const candidates = [
    { classification: 'auto-approvable-first-party', approval_status: 'pending', geographic_coverage: 'Northern Ireland', canonical_route: 'https://gov.uk/guidance/internal-market-scheme' },
    { classification: 'auto-approvable-first-party', approval_status: 'pending', geographic_coverage: 'Northern Ireland', canonical_route: 'https://nationalcareers.service.gov.uk/job-profiles/market-trader' }
  ];
  assert.deepEqual(autoApprovePublicServiceCandidates(candidates, { now: NOW }), candidates);
});

test('UK discovery prefers page-backed geography over the search query region', async () => {
  const discovery = await runUkSourceDiscovery({ SERPER_API_KEY: 'fixture' }, {
    query_limit: 1,
    results_per_query: 1,
    candidate_limit: 1,
    as_of: NOW
  }, {
    directDiscovery: async () => ({ seed_count: 0, candidates: [] }),
    search: async (_env, query) => [{ query, rank: 1, title: 'Winchester City Council markets - apply to trade', url: 'https://new-winchester.gov.uk/business/street-market-trading', snippet: 'Apply to trade at Winchester market in England.' }],
    fetchCandidate: async (result, plan) => ({ result, plan, fetch_status: 'fetched', final_url: result.url, page_text: 'England market. Apply to trade at Winchester market. Trader applications are open and pitches are available.' })
  });
  assert.equal(discovery.approved_candidates[0].geographic_coverage, 'Hampshire');
});
