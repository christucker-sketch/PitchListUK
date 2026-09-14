import { runCanadaSourceDiscovery } from './ca-source-discovery.mjs';
import {
  openCanadaSourcePullRequest,
  planCanadaSourceRegistry,
  readMainCanadaSourceRegistry
} from './ca-source-publication.mjs';

function boundedNumber(value, fallback, maximum, minimum = 1) {
  const number = Number(value ?? fallback);
  return Math.min(maximum, Math.max(minimum, Number.isFinite(number) ? number : fallback));
}

export function canadaSourceDiscoveryWorkflowLimits(payload = {}) {
  const controllerTriggered = payload.trigger === 'ca-cloud-controller';
  return Object.freeze({
    query_limit: boundedNumber(payload.query_limit, 4, 12),
    results_per_query: controllerTriggered ? 8 : boundedNumber(payload.results_per_query, 5, 8),
    candidate_limit: controllerTriggered ? 32 : boundedNumber(payload.candidate_limit, 24, 32),
    timeout_ms: boundedNumber(payload.timeout_ms, 12000, 30000, 1000)
  });
}

export async function runCanadaSourceDiscoveryWorkflow(env, event, step) {
  const payload = event?.payload || {};
  const generatedAt = String(payload.as_of || new Date().toISOString());
  const limits = canadaSourceDiscoveryWorkflowLimits(payload);

  const base = await step.do('read current Canada approved source registry from GitHub main', {
    retries: { limit: 3, delay: '15 seconds', backoff: 'exponential' },
    timeout: '5 minutes'
  }, async () => readMainCanadaSourceRegistry(env));

  const discovery = await step.do(`discover Canada source candidates offset ${Math.max(0, Number(payload.query_offset || 0))}`, {
    retries: { limit: 2, delay: '30 seconds', backoff: 'exponential' },
    timeout: '15 minutes'
  }, async () => runCanadaSourceDiscovery(env, {
    ...payload,
    as_of: generatedAt,
    ...limits
  }));

  const plan = await step.do('build additions-only Canada source promotion plan', async () => (
    planCanadaSourceRegistry(base, discovery.approved_sources)
  ));

  const additions = Number(plan.summary.additions || 0);
  const publication = additions > 0
    ? await step.do('create or reuse Canada source-registry PR', {
        retries: { limit: 2, delay: '15 seconds', backoff: 'exponential' },
        timeout: '5 minutes'
      }, async () => openCanadaSourcePullRequest(env, {
        base,
        plan,
        query_count: discovery.query_count,
        serper_credits_used: discovery.serper_credits_used,
        manual_review_count: discovery.manual_review_count
      }))
    : Object.freeze({ created: false, reused: false, reason: 'no_net_new_sources', additions: 0, source_ids: [] });

  return Object.freeze({
    country: 'CA',
    mode: 'ca_source_discovery_pr',
    generated_at: generatedAt,
    query_offset: discovery.query_offset,
    next_query_offset: discovery.next_query_offset,
    query_count: discovery.query_count,
    plan_size: discovery.plan_size,
    results_per_query: limits.results_per_query,
    candidate_limit: limits.candidate_limit,
    serper_credits_used: discovery.serper_credits_used,
    search_candidates: discovery.search_candidates,
    auto_approved_count: discovery.approved_source_count,
    manual_review_count: discovery.manual_review_count,
    held_count: discovery.held_count,
    source_count_before: base.registry.length,
    source_count_after_planned: plan.summary.after_count,
    source_additions: additions,
    source_removals: 0,
    source_ids: Object.freeze(plan.additions.map(source => source.id)),
    source_pr_attempted: additions > 0,
    source_pr: publication,
    opportunity_pr_attempted: false,
    production_opportunity_write_attempted: false,
    direct_production_deployment_attempted: false,
    automatic_merge_attempted: false
  });
}
