import sourcesLib from '../../opportunity-pipeline/config/sources.js';
import publicationLib from '../../opportunity-pipeline/lib/uk-addition-publication.js';
import {
  pollApprovedSourceBatch,
  sourcePollBatches,
  summarizeApprovedSourcePoll
} from '../../cloudflare-uk-canary/lib/uk-approved-source-poll.mjs';
import {
  openUkAdditionPullRequest,
  readMainMarketSnapshot
} from './github-publication.mjs';

const { APPROVED_SOURCES } = sourcesLib;
const {
  applyAutomaticAdditionManifest,
  buildAutomaticAdditionManifest
} = publicationLib;

const MAX_ADDITIONS = 50;
const MAX_GROWTH_PERCENT = 25;
const MAX_PER_SOURCE = 1;
const MAX_DUPLICATE_RATE = 60;

function boundedNumber(value, fallback, maximum, minimum = 1) {
  const number = Number(value || fallback);
  return Math.min(maximum, Math.max(minimum, Number.isFinite(number) ? number : fallback));
}

function compactPollSummary(summary) {
  return Object.freeze({
    approved_registry_count: summary.approved_registry_count,
    direct_route_count: summary.direct_route_count,
    batch_count: summary.batch_count,
    passed_count: summary.passed_count,
    held_count: summary.held_count,
    rejected_count: summary.rejected_count,
    customer_ready_count: summary.customer_ready_count,
    reason_counts: summary.reason_counts,
    serper_credits_used: 0
  });
}

export async function runUkAdditionsOnlyWorkflow(env, event, step) {
  const payload = event?.payload || {};
  const generatedAt = String(payload.as_of || new Date().toISOString());
  const batchSize = boundedNumber(payload.batch_size, 8, 10);
  const concurrency = boundedNumber(payload.concurrency, 3, 3);
  const timeoutMs = boundedNumber(payload.timeout_ms, 12000, 20000, 5000);
  const maxAttempts = boundedNumber(payload.max_attempts, 1, 2);
  const batches = sourcePollBatches(APPROVED_SOURCES, { batch_size: batchSize });
  const batchReports = [];

  for (let index = 0; index < batches.length; index += 1) {
    const sources = batches[index];
    batchReports.push(await step.do(`poll UK publication batch ${index + 1} of ${batches.length}`, {
      retries: { limit: 2, delay: '30 seconds', backoff: 'exponential' },
      timeout: '10 minutes'
    }, async () => pollApprovedSourceBatch({
      sources,
      concurrency,
      timeout_ms: timeoutMs,
      max_attempts: maxAttempts,
      now: generatedAt,
      include_reviewed_row: true
    })));
  }

  const pollSummary = summarizeApprovedSourcePoll(batchReports, {
    generated_at: generatedAt,
    approved_registry_count: APPROVED_SOURCES.length
  });
  const reviewedRows = pollSummary.results
    .filter(result => result.quality_status === 'customer_ready' && result.publishable === true && result.reviewed_row)
    .map(result => result.reviewed_row);

  const base = await step.do('read current UK production snapshot from GitHub main', {
    retries: { limit: 3, delay: '15 seconds', backoff: 'exponential' },
    timeout: '5 minutes'
  }, async () => readMainMarketSnapshot(env, 'UK'));

  const directReport = {
    mode: 'direct-approved-source-fetch',
    generated_at: generatedAt,
    serper_credits_used: 0,
    fetched_urls: reviewedRows.map(row => row.source_url)
  };

  const manifest = await step.do('build UK additions-only publication manifest', async () => (
    buildAutomaticAdditionManifest({
      snapshot: base.snapshot,
      rows: reviewedRows,
      directReport,
      reviewedCommit: base.mainSha,
      today: generatedAt.slice(0, 10),
      maxAdditions: Math.min(MAX_ADDITIONS, boundedNumber(payload.max_additions, MAX_ADDITIONS, MAX_ADDITIONS)),
      maxGrowthPercent: Math.min(MAX_GROWTH_PERCENT, boundedNumber(payload.max_growth_percent, MAX_GROWTH_PERCENT, MAX_GROWTH_PERCENT)),
      maxPerSource: Math.min(MAX_PER_SOURCE, boundedNumber(payload.max_per_source, MAX_PER_SOURCE, MAX_PER_SOURCE)),
      maxDuplicateRate: Math.min(MAX_DUPLICATE_RATE, boundedNumber(payload.max_duplicate_rate, MAX_DUPLICATE_RATE, MAX_DUPLICATE_RATE))
    })
  ));

  const nextSnapshot = await step.do('plan UK additions-only snapshot', async () => (
    applyAutomaticAdditionManifest(base.snapshot, manifest, { generated_at: generatedAt })
  ));

  const additions = Number(manifest.changes.additions.length || 0);
  const publication = additions > 0
    ? await step.do('create or reuse UK additions-only data PR', {
        retries: { limit: 2, delay: '15 seconds', backoff: 'exponential' },
        timeout: '5 minutes'
      }, async () => openUkAdditionPullRequest(env, {
        base,
        manifest,
        nextSnapshot,
        reviewed_row_count: reviewedRows.length
      }))
    : Object.freeze({ created: false, reason: 'no_net_new_rows', additions: 0 });

  return Object.freeze({
    country: 'UK',
    mode: 'uk_additions_only_pr',
    generated_at: generatedAt,
    poll: compactPollSummary(pollSummary),
    production_count_before: base.snapshot.rows.length,
    production_count_after_planned: nextSnapshot.rows.length,
    manifest_additions: additions,
    held_existing_route_updates: manifest.automation.held_existing_routes.length,
    observed_duplicate_rate: manifest.automation.observed_duplicate_rate,
    source_pr_attempted: false,
    opportunity_pr_attempted: additions > 0,
    opportunity_pr: publication,
    publication_attempted: false,
    production_mutation_attempted: false,
    repository_branch_mutation_attempted: additions > 0,
    automatic_merge_attempted: false,
    serper_credits_used: 0
  });
}

export const UK_GLOBAL_ADDITION_LIMITS = Object.freeze({
  max_additions: MAX_ADDITIONS,
  max_growth_percent: MAX_GROWTH_PERCENT,
  max_per_source: MAX_PER_SOURCE,
  max_duplicate_rate: MAX_DUPLICATE_RATE
});
