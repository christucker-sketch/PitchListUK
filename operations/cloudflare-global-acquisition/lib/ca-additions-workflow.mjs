import { readMainCanadaSourceRegistry } from './ca-source-publication.mjs';
import { pollCanadaApprovedSources } from './ca-opportunity-acquisition.mjs';
import {
  openCanadaOpportunityPullRequest,
  planCanadaOpportunityAdditions,
  readMainCanadaSnapshot
} from './ca-opportunity-publication.mjs';

function boundedNumber(value, fallback, maximum, minimum = 1) {
  const number = Number(value ?? fallback);
  return Math.min(maximum, Math.max(minimum, Number.isFinite(number) ? number : fallback));
}

export function canadaAdditionWorkflowLimits(payload = {}) {
  const controllerTriggered = payload.trigger === 'ca-cloud-controller';
  return Object.freeze({
    concurrency: controllerTriggered ? 4 : boundedNumber(payload.concurrency, 3, 4),
    timeout_ms: boundedNumber(payload.timeout_ms, 12000, 30000, 1000),
    max_additions: controllerTriggered ? 25 : boundedNumber(payload.max_additions, 10, 25)
  });
}

export async function runCanadaAdditionsOnlyWorkflow(env, event, step) {
  const payload = event?.payload || {};
  const generatedAt = String(payload.as_of || new Date().toISOString());
  const limits = canadaAdditionWorkflowLimits(payload);
  const [sources, base] = await Promise.all([
    step.do('read current Canada approved source registry from GitHub main', {
      retries: { limit: 3, delay: '15 seconds', backoff: 'exponential' },
      timeout: '5 minutes'
    }, async () => readMainCanadaSourceRegistry(env)),
    step.do('read current Canada opportunity snapshot from GitHub main', {
      retries: { limit: 3, delay: '15 seconds', backoff: 'exponential' },
      timeout: '5 minutes'
    }, async () => readMainCanadaSnapshot(env))
  ]);

  if (sources.mainSha !== base.mainSha) throw new Error('ca_additions_main_snapshot_drift');
  const approvedSources = [...sources.registry].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const poll = await step.do(`poll ${approvedSources.length} approved Canada sources`, {
    retries: { limit: 2, delay: '30 seconds', backoff: 'exponential' },
    timeout: '15 minutes'
  }, async () => pollCanadaApprovedSources(approvedSources, {
    concurrency: limits.concurrency,
    timeout_ms: limits.timeout_ms,
    now: generatedAt
  }));

  const plan = await step.do('plan additions-only Canada opportunity snapshot', async () => (
    planCanadaOpportunityAdditions(base, poll.rows, {
      generated_at: generatedAt,
      max_additions: limits.max_additions
    })
  ));

  const additions = Number(plan.summary.additions || 0);
  const publication = additions > 0
    ? await step.do('create or reuse Canada additions-only data PR', {
        retries: { limit: 2, delay: '15 seconds', backoff: 'exponential' },
        timeout: '5 minutes'
      }, async () => openCanadaOpportunityPullRequest(env, { base, plan }))
    : Object.freeze({ created: false, reused: false, reason: 'no_net_new_rows', additions: 0, opportunity_ids: [] });

  return Object.freeze({
    country: 'CA',
    mode: 'ca_additions_only_pr',
    generated_at: generatedAt,
    source_count: approvedSources.length,
    concurrency: limits.concurrency,
    max_additions: limits.max_additions,
    passed_source_count: poll.passed_count,
    held_source_count: poll.held_count,
    held: poll.held,
    production_count_before: base.snapshot.rows.length,
    production_count_after_planned: plan.snapshot.rows.length,
    manifest_additions: additions,
    opportunity_ids: Object.freeze(plan.additions.map(row => row.id)),
    source_pr_attempted: false,
    opportunity_pr_attempted: additions > 0,
    opportunity_pr: publication,
    updates: 0,
    removals: 0,
    automatic_merge_attempted: false,
    direct_production_deployment_attempted: false,
    serper_credits_used: 0
  });
}

export const CA_ADDITION_LIMITS = Object.freeze({
  maximum_additions: 25,
  maximum_concurrency: 4
});
