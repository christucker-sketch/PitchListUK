import sourcesLib from '../../opportunity-pipeline/config/sources.js';
import safetyLib from '../../opportunity-pipeline/lib/opportunity-safety.js';
import { runUkSourceDiscovery } from './uk-source-discovery.mjs';
import { searchViaSerperBroker } from './service-serper-search.mjs';
import {
  openUkSourcePullRequest,
  planUkSourceRegistry,
  readMainUkSourceRegistry
} from './uk-source-publication.mjs';

const { APPROVED_SOURCES, termsReviewed } = sourcesLib;
const { canonicalUrl } = safetyLib;

function boundedNumber(value, fallback, maximum, minimum = 1) {
  const number = Number(value || fallback);
  return Math.min(maximum, Math.max(minimum, Number.isFinite(number) ? number : fallback));
}

export function trustedUkDiscoverySeeds(registry = [], approvedSources = APPROVED_SOURCES) {
  const routes = [];
  for (const item of registry || []) routes.push(item?.official_application_route);
  for (const source of approvedSources || []) {
    if (source?.approved !== true || !termsReviewed(source)) continue;
    routes.push(source?.official_application_route);
  }
  return Object.freeze([...new Set(routes.map(route => canonicalUrl(route)).filter(route => route?.startsWith('https://')))].sort());
}

export async function runUkSourceDiscoveryWorkflow(env, event, step) {
  const payload = event?.payload || {};
  const generatedAt = String(payload.as_of || new Date().toISOString());
  const base = await step.do('read current UK approved source registry from GitHub main', {
    retries: { limit: 3, delay: '15 seconds', backoff: 'exponential' },
    timeout: '5 minutes'
  }, async () => readMainUkSourceRegistry(env));

  const trustedSeeds = trustedUkDiscoverySeeds(base.registry);

  const discovery = await step.do(`discover UK source candidates offset ${Math.max(0, Number(payload.query_offset || 0))}`, {
    retries: { limit: 2, delay: '30 seconds', backoff: 'exponential' },
    timeout: '15 minutes'
  }, async () => runUkSourceDiscovery(env, {
    ...payload,
    seed_routes: Array.isArray(payload.seed_routes) && payload.seed_routes.length ? payload.seed_routes : trustedSeeds,
    serper_fallback: payload.serper_fallback !== false,
    as_of: generatedAt,
    query_limit: boundedNumber(payload.query_limit, 8, 12),
    results_per_query: boundedNumber(payload.results_per_query, 5, 8),
    candidate_limit: boundedNumber(payload.candidate_limit, 30, 50),
    direct_seed_limit: boundedNumber(payload.direct_seed_limit, 50, 50),
    concurrency: boundedNumber(payload.concurrency, 2, 3),
    timeout_ms: boundedNumber(payload.timeout_ms, 12000, 20000, 5000)
  }, {
    search: searchViaSerperBroker
  }));

  const plan = await step.do('build additions-only UK source promotion plan', async () => (
    planUkSourceRegistry(base, discovery.approved_candidates, {
      reviewer: 'FindPitches Cloudflare deterministic source automation',
      generated_at: generatedAt
    })
  ));

  const additions = Number(plan.summary.additions || 0);
  const publication = additions > 0
    ? await step.do('create or reuse UK source-registry PR', {
        retries: { limit: 2, delay: '15 seconds', backoff: 'exponential' },
        timeout: '5 minutes'
      }, async () => openUkSourcePullRequest(env, {
        base,
        plan,
        query_count: discovery.query_count,
        serper_credits_used: discovery.serper_credits_used,
        manual_review_count: discovery.manual_review_count
      }))
    : Object.freeze({ created: false, reason: 'no_net_new_sources', additions: 0 });

  return Object.freeze({
    country: 'UK',
    mode: 'uk_source_discovery_pr',
    generated_at: generatedAt,
    discovery_network: discovery.discovery_network,
    trusted_seed_inventory_count: trustedSeeds.length,
    direct_seed_count: discovery.direct_seed_count,
    direct_candidates_found: discovery.direct_candidates_found,
    serper_fallback_used: discovery.serper_fallback_used,
    query_offset: discovery.query_offset,
    query_count: discovery.query_count,
    serper_credits_used: discovery.serper_credits_used,
    search_results: discovery.search_results,
    candidates_fetched: discovery.candidates_fetched,
    candidates_classified: discovery.candidates_classified,
    auto_approved_count: discovery.auto_approved_count,
    manual_review_count: discovery.manual_review_count,
    classifications: discovery.classifications,
    source_count_before: base.registry.length,
    source_count_after_planned: plan.summary.after_count,
    source_additions: additions,
    source_removals: 0,
    source_pr_attempted: additions > 0,
    source_pr: publication,
    opportunity_pr_attempted: false,
    production_opportunity_write_attempted: false,
    direct_production_deployment_attempted: false,
    automatic_merge_attempted: false
  });
}
