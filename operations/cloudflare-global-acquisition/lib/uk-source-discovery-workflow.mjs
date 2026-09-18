import sourcesLib from '../../opportunity-pipeline/config/sources.js';
import safetyLib from '../../opportunity-pipeline/lib/opportunity-safety.js';
import { runUkSourceDiscovery } from './uk-source-discovery.mjs';
import { runUkOpportunityFirstDiscovery } from './uk-opportunity-first-discovery.mjs';
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

function addClassificationCounts(left = {}, right = {}) {
  const merged = { ...left };
  for (const [key, value] of Object.entries(right || {})) merged[key] = Number(merged[key] || 0) + Number(value || 0);
  return Object.freeze(merged);
}

function deterministicPrivateFirstParty(candidate, now) {
  if (!candidate || candidate.classification !== 'manual-review-required') return null;
  if (candidate.rejection_reason !== 'private_or_non_public_service_source_requires_review') return null;
  if (!candidate.canonical_route || !candidate.canonical_host || !candidate.organisation || !candidate.geographic_coverage || !candidate.opportunity_type) return null;
  if (/trusted-source graph/i.test(String(candidate.geographic_coverage || ''))) return null;
  if (!candidate.trader_application_evidence || candidate.fetch_status !== 'fetched' || candidate.robots_result !== 'allowed') return null;
  return Object.freeze({
    ...candidate,
    approval_status: 'approved',
    reviewer_decision: 'approved_deterministic_first_party_live_trader_route',
    reviewer: 'FindPitches Cloudflare deterministic opportunity evidence',
    decision_timestamp: now
  });
}

export function promoteUkOpportunityFirstCandidates(discovery, { now = new Date().toISOString() } = {}) {
  const approved = [...(discovery?.approved_candidates || [])];
  const remainingReview = [];
  let promoted = 0;
  for (const candidate of discovery?.review_queue || []) {
    const deterministic = deterministicPrivateFirstParty(candidate, now);
    if (deterministic) {
      approved.push(deterministic);
      promoted += 1;
    } else {
      remainingReview.push(candidate);
    }
  }
  return Object.freeze({
    ...discovery,
    approved_candidates: Object.freeze(approved),
    review_queue: Object.freeze(remainingReview),
    auto_approved_count: Number(discovery?.auto_approved_count || 0) + promoted,
    deterministic_first_party_promotions: promoted,
    manual_review_count: remainingReview.length
  });
}

export async function runUkDiscoveryWithEffectiveFallback(env, payload = {}, options = {}) {
  const direct = promoteUkOpportunityFirstCandidates(await runUkSourceDiscovery(env, payload, options), { now: payload.as_of });
  const controllerRun = String(payload.trigger || '') === 'uk-cloud-controller';
  const shouldSearch = payload.serper_fallback !== false
    && direct.serper_fallback_used !== true
    && (controllerRun || Number(direct.auto_approved_count || 0) === 0);
  if (!shouldSearch) return direct;

  const searched = promoteUkOpportunityFirstCandidates(await runUkSourceDiscovery(env, {
    ...payload,
    seed_routes: [],
    serper_fallback: true
  }, options), { now: payload.as_of });

  const approvedByRoute = new Map();
  for (const candidate of [...(direct.approved_candidates || []), ...(searched.approved_candidates || [])]) {
    const route = canonicalUrl(candidate?.canonical_route);
    if (route && !approvedByRoute.has(route)) approvedByRoute.set(route, candidate);
  }

  return Object.freeze({
    ...searched,
    discovery_network: `${direct.discovery_network}+${searched.discovery_network}`,
    direct_seed_count: Number(direct.direct_seed_count || 0),
    direct_candidates_found: Number(direct.direct_candidates_found || 0),
    serper_fallback_used: searched.serper_fallback_used === true,
    search_results: Number(direct.search_results || 0) + Number(searched.search_results || 0),
    candidates_fetched: Number(direct.candidates_fetched || 0) + Number(searched.candidates_fetched || 0),
    candidates_classified: Number(direct.candidates_classified || 0) + Number(searched.candidates_classified || 0),
    auto_approved_count: approvedByRoute.size,
    deterministic_first_party_promotions: Number(direct.deterministic_first_party_promotions || 0) + Number(searched.deterministic_first_party_promotions || 0),
    manual_review_count: Number(direct.manual_review_count || 0) + Number(searched.manual_review_count || 0),
    classifications: addClassificationCounts(direct.classifications, searched.classifications),
    approved_candidates: Object.freeze([...approvedByRoute.values()]),
    review_queue: Object.freeze([...(direct.review_queue || []), ...(searched.review_queue || [])])
  });
}

function mergeApprovedCandidates(...groups) {
  const byRoute = new Map();
  for (const candidate of groups.flat()) {
    const route = canonicalUrl(candidate?.canonical_route);
    if (route && !byRoute.has(route)) byRoute.set(route, candidate);
  }
  return Object.freeze([...byRoute.values()]);
}

export async function runUkSourceDiscoveryWorkflow(env, event, step) {
  const payload = event?.payload || {};
  const generatedAt = String(payload.as_of || new Date().toISOString());
  const base = await step.do('read current UK approved source registry from GitHub main', {
    retries: { limit: 3, delay: '15 seconds', backoff: 'exponential' },
    timeout: '5 minutes'
  }, async () => readMainUkSourceRegistry(env));

  const trustedSeeds = trustedUkDiscoverySeeds(base.registry);
  const controllerRun = String(payload.trigger || '') === 'uk-cloud-controller';
  const effectivePayload = {
    ...payload,
    seed_routes: Array.isArray(payload.seed_routes) && payload.seed_routes.length ? payload.seed_routes : trustedSeeds,
    serper_fallback: payload.serper_fallback !== false,
    as_of: generatedAt,
    query_limit: boundedNumber(payload.query_limit, 8, 12),
    results_per_query: controllerRun ? 8 : boundedNumber(payload.results_per_query, 5, 8),
    candidate_limit: controllerRun ? 50 : boundedNumber(payload.candidate_limit, 30, 50),
    direct_seed_limit: boundedNumber(payload.direct_seed_limit, 50, 50),
    concurrency: boundedNumber(payload.concurrency, 2, 3),
    timeout_ms: boundedNumber(payload.timeout_ms, 12000, 20000, 5000)
  };

  const discovery = await step.do(`discover UK source graph candidates offset ${Math.max(0, Number(payload.query_offset || 0))}`, {
    retries: { limit: 2, delay: '30 seconds', backoff: 'exponential' },
    timeout: '15 minutes'
  }, async () => runUkDiscoveryWithEffectiveFallback(env, effectivePayload, {
    search: searchViaSerperBroker
  }));

  const opportunityDiscovery = await step.do(`discover UK opportunities directly offset ${Math.max(0, Number(payload.query_offset || 0))}`, {
    retries: { limit: 2, delay: '30 seconds', backoff: 'exponential' },
    timeout: '15 minutes'
  }, async () => runUkOpportunityFirstDiscovery(env, {
    ...effectivePayload,
    query_limit: controllerRun ? 4 : Math.min(4, effectivePayload.query_limit),
    candidate_limit: controllerRun ? 48 : Math.min(32, effectivePayload.candidate_limit)
  }, {
    search: (query, options) => searchViaSerperBroker(env, query, options)
  }));

  const approvedCandidates = mergeApprovedCandidates(discovery.approved_candidates || [], opportunityDiscovery.approved_candidates || []);
  const plan = await step.do('build additions-only UK source promotion plan', async () => (
    planUkSourceRegistry(base, approvedCandidates, {
      reviewer: 'FindPitches Cloudflare deterministic opportunity evidence',
      generated_at: generatedAt
    })
  ));

  const additions = Number(plan.summary.additions || 0);
  const totalSearchResults = Number(discovery.search_results || 0) + Number(opportunityDiscovery.results_seen || 0);
  const totalSerperCredits = Number(discovery.serper_credits_used || 0) + Number(opportunityDiscovery.serper_credits_used || 0);
  const totalReview = Number(discovery.manual_review_count || 0) + Number(opportunityDiscovery.review_count || 0);
  const publication = additions > 0
    ? await step.do('create or reuse UK source-registry PR', {
        retries: { limit: 2, delay: '15 seconds', backoff: 'exponential' },
        timeout: '5 minutes'
      }, async () => openUkSourcePullRequest(env, {
        base,
        plan,
        query_count: Number(discovery.query_count || 0) + Number(opportunityDiscovery.query_count || 0),
        serper_credits_used: totalSerperCredits,
        manual_review_count: totalReview
      }))
    : Object.freeze({ created: false, reason: 'no_net_new_sources', additions: 0 });

  return Object.freeze({
    country: 'UK',
    mode: 'uk_source_discovery_pr',
    generated_at: generatedAt,
    discovery_network: `${discovery.discovery_network}+opportunity_first_serper`,
    discovery_strategy: 'opportunity_first_with_source_promotion',
    trusted_seed_inventory_count: trustedSeeds.length,
    direct_seed_count: discovery.direct_seed_count,
    direct_candidates_found: discovery.direct_candidates_found,
    serper_fallback_used: discovery.serper_fallback_used,
    query_offset: discovery.query_offset,
    query_count: Number(discovery.query_count || 0) + Number(opportunityDiscovery.query_count || 0),
    effective_results_per_query: effectivePayload.results_per_query,
    effective_candidate_limit: effectivePayload.candidate_limit,
    serper_credits_used: totalSerperCredits,
    search_results: totalSearchResults,
    candidates_fetched: Number(discovery.candidates_fetched || 0) + Number(opportunityDiscovery.candidates_fetched || 0),
    candidates_classified: Number(discovery.candidates_classified || 0) + Number(opportunityDiscovery.candidates_fetched || 0),
    auto_approved_count: approvedCandidates.length,
    deterministic_first_party_promotions: Number(discovery.deterministic_first_party_promotions || 0) + Number(opportunityDiscovery.approved_count || 0),
    opportunity_first_approved_count: Number(opportunityDiscovery.approved_count || 0),
    opportunity_first_held_count: Number(opportunityDiscovery.held_count || 0),
    manual_review_count: totalReview,
    classifications: discovery.classifications,
    source_count_before: base.registry.length,
    source_count_after_planned: plan.summary.after_count,
    source_additions: additions,
    source_removals: 0,
    growth_health: additions > 0 ? 'productive' : (totalSearchResults > 0 ? 'zero_yield' : 'no_search_results'),
    source_pr_attempted: additions > 0,
    source_pr: publication,
    opportunity_pr_attempted: false,
    production_opportunity_write_attempted: false,
    direct_production_deployment_attempted: false,
    automatic_merge_attempted: false
  });
}