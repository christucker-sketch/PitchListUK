import { runApprovedTexasStaging } from '../../opportunity-pipeline/lib/texas-staging-runner.js';
import { runApprovedStateStaging } from '../../opportunity-pipeline/lib/us-state-staging-runner.js';
import liveFetch from '../../opportunity-pipeline/lib/us-live-page-fetch.js';
import { getStateConfig } from '../../cloudflare-texas-acquisition/src/us-state-registry.js';

const { fetchApprovedPage } = liveFetch;
const DEFAULT_SOURCE_LIMIT = 3;
const MAX_SOURCE_LIMIT = 5;

function reasonCounts(items = []) {
  const counts = {};
  for (const item of items) {
    const reasons = Array.isArray(item?.reasons) && item.reasons.length ? item.reasons : [item?.reason || 'unspecified'];
    for (const reason of reasons) {
      const key = String(reason || 'unspecified');
      counts[key] = (counts[key] || 0) + 1;
    }
  }
  return counts;
}

export function selectUsReadOnlySources(state, options = {}) {
  const requestedIds = Array.isArray(options.source_ids) ? options.source_ids.map(value => String(value || '').trim()).filter(Boolean) : [];
  const limit = Math.min(MAX_SOURCE_LIMIT, Math.max(1, Number(options.source_limit || DEFAULT_SOURCE_LIMIT)));
  const selected = requestedIds.length
    ? state.sources.filter(source => requestedIds.includes(source.id))
    : state.sources.slice(0, limit);

  if (requestedIds.length && selected.length !== requestedIds.length) throw new Error(`${state.name} read-only poll contains an unknown source id`);
  if (!selected.length) throw new Error(`${state.name} read-only poll selected no approved sources`);
  if (selected.length > MAX_SOURCE_LIMIT) throw new Error(`US read-only poll exceeds maximum of ${MAX_SOURCE_LIMIT} sources`);
  return Object.freeze([...selected]);
}

export async function runUsApprovedSourceReadOnlyPoll(payload = {}, options = {}) {
  const stateCode = String(payload.state_code || '').trim().toUpperCase();
  if (!stateCode) throw new Error('US global read-only poll requires state_code');
  const state = getStateConfig(stateCode);
  const sources = selectUsReadOnlySources(state, payload);
  const generatedAt = String(payload.as_of || options.generatedAt || new Date().toISOString());
  const fetchPage = options.fetchPage || (candidate => fetchApprovedPage(candidate, { timeoutMs: Number(payload.timeout_ms || 15000) }));
  const runnerOptions = {
    sources,
    generatedAt,
    runId: `global-readonly-us-${state.slug}-${generatedAt.replace(/[:.]/g, '-')}`,
    fetchPage
  };
  const staging = state.code === 'TX'
    ? await runApprovedTexasStaging(runnerOptions)
    : await runApprovedStateStaging(state, runnerOptions);

  return Object.freeze({
    country: 'US',
    mode: 'approved_source_cloudflare_read_only_poll',
    state_code: state.code,
    state_name: state.name,
    generated_at: generatedAt,
    source_count: sources.length,
    source_ids: Object.freeze(sources.map(source => source.id)),
    staged_count: Number(staging.staged_count || 0),
    held_count: Number(staging.held_count || 0),
    rejected_count: Number(staging.rejected_count || 0),
    duplicate_count: Number(staging.duplicate_count || 0),
    evidence_passed_count: Array.isArray(staging.evidence_receipts) ? staging.evidence_receipts.length : 0,
    held_reasons: Object.freeze(reasonCounts(staging.held || [])),
    rejected_reasons: Object.freeze(reasonCounts(staging.rejected || [])),
    serper_credits_used: 0,
    discovery_attempted: false,
    source_pr_attempted: false,
    opportunity_pr_attempted: false,
    publication_attempted: false,
    mutation_attempted: false
  });
}

export const US_GLOBAL_READ_ONLY_LIMITS = Object.freeze({
  default_source_limit: DEFAULT_SOURCE_LIMIT,
  maximum_source_limit: MAX_SOURCE_LIMIT
});
