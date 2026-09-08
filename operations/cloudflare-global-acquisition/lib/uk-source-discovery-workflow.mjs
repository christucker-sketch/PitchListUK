import { runUkSourceDiscovery } from './uk-source-discovery.mjs';
import {
  openUkSourcePullRequest,
  planUkSourceRegistry,
  readMainUkSourceRegistry
} from './uk-source-publication.mjs';

function boundedNumber(value, fallback, maximum, minimum = 1) {
  const number = Number(value || fallback);
  return Math.min(maximum, Math.max(minimum, Number.isFinite(number) ? number : fallback));
}

export async function runUkSourceDiscoveryWorkflow(env, event, step) {
  const payload = event?.payload || {};
  const generatedAt = String(payload.as_of || new Date().toISOString());
  const base = await step.do('read current UK approved source registry from GitHub main', {
    retries: { limit: 3, delay: '15 seconds', backoff: 'exponential' },
    timeout: '5 minutes'
  }, async () => readMainUkSourceRegistry(env));

  const discovery = await step.do(`discover UK source candidates offset ${Math.max(0, Number(payload.query_offset || 0))}`, {
    retries: { limit: 2, delay: '30 seconds', backoff: 'exponential' },
    timeout: '15 minutes'
  }, async () => runUkSourceDiscovery(env, {
    ...payload,
    as_of: generatedAt,
    query_limit: boundedNumber(payload.query_limit, 8, 12),
    results_per_query: boundedNumber(payload.results_per_query, 5, 8),
    candidate_limit: boundedNumber(payload.candidate_limit, 30, 50),
    concurrency: boundedNumber(payload.concurrency, 2, 3),
    timeout_ms: boundedNumber(payload.timeout_ms, 12000, 20000, 5000)
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
