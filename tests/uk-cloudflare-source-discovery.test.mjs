import assert from 'node:assert/strict';
import test from 'node:test';

import { runUkSourceDiscovery, UK_SOURCE_DISCOVERY_LIMITS } from '../operations/cloudflare-global-acquisition/lib/uk-source-discovery.mjs';
import { planUkSourceRegistry, ukSourceBranchName } from '../operations/cloudflare-global-acquisition/lib/uk-source-publication.mjs';

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
  assert.equal(UK_SOURCE_DISCOVERY_LIMITS.maximum_candidate_limit, 50);
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
