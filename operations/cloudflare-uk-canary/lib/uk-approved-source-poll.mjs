import sourcesLib from '../../opportunity-pipeline/config/sources.js';
import extractLib from '../../opportunity-pipeline/acquisition/extract.js';
import fetchPolicyLib from '../../opportunity-pipeline/lib/fetch-policy.js';
import safetyLib from '../../opportunity-pipeline/lib/opportunity-safety.js';

const { APPROVED_SOURCES, sourceRuleFor, termsReviewed } = sourcesLib;
const { sourceCandidateToRow } = extractLib;
const { createPolicyFetcher, mapBounded } = fetchPolicyLib;
const { canonicalUrl, evaluateOpportunity } = safetyLib;

const DEFAULT_BATCH_SIZE = 8;
const MAX_BATCH_SIZE = 10;
const MAX_BODY_BYTES = 240000;

function compactSource(source, route) {
  return Object.freeze({
    organisation: source.organisation,
    host: source.host,
    type: source.type,
    geographic_coverage: source.geographic_coverage || '',
    opportunity_type: source.opportunity_type || '',
    recurring: source.recurring === true,
    recommended_polling_days: Number(source.recommended_polling_days || 30),
    opportunity_title: source.opportunity_title || source.organisation,
    official_application_route: route,
    approval_evidence_hash: source.approval_evidence_hash || ''
  });
}

export function approvedDirectSourceInventory(sources = APPROVED_SOURCES) {
  const byRoute = new Map();
  for (const source of sources || []) {
    const route = canonicalUrl(source?.official_application_route);
    if (!route || source?.approved !== true || !termsReviewed(source)) continue;
    if (!byRoute.has(route)) byRoute.set(route, compactSource(source, route));
  }
  return Object.freeze([...byRoute.values()].sort((a, b) => (
    a.organisation.localeCompare(b.organisation) || a.official_application_route.localeCompare(b.official_application_route)
  )));
}

export function sourcePollBatches(sources = APPROVED_SOURCES, options = {}) {
  const inventory = approvedDirectSourceInventory(sources);
  const batchSize = Math.min(MAX_BATCH_SIZE, Math.max(1, Number(options.batch_size || DEFAULT_BATCH_SIZE)));
  const batches = [];
  for (let index = 0; index < inventory.length; index += batchSize) batches.push(inventory.slice(index, index + batchSize));
  return Object.freeze(batches.map(batch => Object.freeze(batch)));
}

function reasonCounts(results = []) {
  const counts = {};
  for (const item of results) {
    const reasons = Array.isArray(item.quality_reasons) && item.quality_reasons.length
      ? item.quality_reasons
      : [item.reason || item.status || 'unspecified'];
    for (const reason of reasons) {
      const key = String(reason || 'unspecified');
      counts[key] = (counts[key] || 0) + 1;
    }
  }
  return counts;
}

function compactReviewedRow(source, finalUrl, row) {
  const status = row.quality_status === 'customer_ready'
    ? 'passed'
    : row.quality_status === 'rejected'
      ? 'rejected'
      : 'held';
  return Object.freeze({
    organisation: source.organisation,
    source_host: source.host,
    source_url: source.official_application_route,
    final_url: finalUrl,
    geographic_coverage: source.geographic_coverage,
    opportunity_type: source.opportunity_type,
    recurring: source.recurring,
    status,
    reason: status === 'passed' ? null : row.quality_status,
    quality_status: row.quality_status,
    quality_reasons: Object.freeze([...(row.quality_reasons || [])]),
    event_name: row.event_name || '',
    location: row.location || '',
    event_start: row.event_start || '',
    event_end: row.event_end || '',
    application_deadline: row.application_deadline || '',
    application_url: row.application_url || '',
    publishable: row.publishable === true
  });
}

async function pollOneSource(source, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const now = options.now instanceof Date ? options.now : new Date(options.now || new Date().toISOString());
  const today = now.toISOString().slice(0, 10);
  const fetchWithPolicy = options.fetchWithPolicy || createPolicyFetcher({ fetchImpl, timeoutMs: Number(options.timeout_ms || 15000) }).fetchWithPolicy;
  const result = await fetchWithPolicy(source.official_application_route, { maxAttempts: Number(options.max_attempts || 2) });
  if (!result.ok) {
    return Object.freeze({
      organisation: source.organisation,
      source_host: source.host,
      source_url: source.official_application_route,
      final_url: '',
      geographic_coverage: source.geographic_coverage,
      opportunity_type: source.opportunity_type,
      recurring: source.recurring,
      status: 'held',
      reason: result.classification || 'fetch_failed',
      quality_status: 'not_evaluated',
      quality_reasons: Object.freeze([result.classification || 'fetch_failed']),
      event_name: source.opportunity_title,
      location: source.geographic_coverage,
      event_start: '',
      event_end: '',
      application_deadline: '',
      application_url: source.official_application_route,
      publishable: false,
      attempts: Number(result.attempts || 0),
      http_status: Number(result.status || 0)
    });
  }

  const finalUrl = canonicalUrl(result.final_url || source.official_application_route);
  const finalRule = sourceRuleFor(finalUrl);
  if (!finalUrl || finalRule?.approved !== true || !termsReviewed(finalRule)) {
    return Object.freeze({
      organisation: source.organisation,
      source_host: source.host,
      source_url: source.official_application_route,
      final_url: finalUrl,
      geographic_coverage: source.geographic_coverage,
      opportunity_type: source.opportunity_type,
      recurring: source.recurring,
      status: 'held',
      reason: 'redirect_outside_approved_source',
      quality_status: 'not_evaluated',
      quality_reasons: Object.freeze(['redirect_outside_approved_source']),
      event_name: source.opportunity_title,
      location: source.geographic_coverage,
      event_start: '',
      event_end: '',
      application_deadline: '',
      application_url: source.official_application_route,
      publishable: false,
      attempts: Number(result.attempts || 1),
      http_status: Number(result.response?.status || 0)
    });
  }

  const html = (await result.response.text()).slice(0, MAX_BODY_BYTES);
  const extracted = sourceCandidateToRow({
    url: finalUrl,
    title: source.opportunity_title || source.organisation,
    snippet: 'Direct approved-source retrieval from Cloudflare',
    query: `direct:${source.official_application_route}`,
    query_lane: 'approved-source-cloudflare-poll'
  }, html, today);
  const reviewed = evaluateOpportunity(extracted, { now });
  return Object.freeze({
    ...compactReviewedRow(source, finalUrl, reviewed),
    attempts: Number(result.attempts || 1),
    http_status: Number(result.response?.status || 200),
    bytes_examined: new TextEncoder().encode(html).length
  });
}

export async function pollApprovedSourceBatch(options = {}) {
  const sources = Array.isArray(options.sources) ? options.sources : approvedDirectSourceInventory();
  if (!sources.length) return Object.freeze({ source_count: 0, passed_count: 0, held_count: 0, rejected_count: 0, results: Object.freeze([]), reason_counts: Object.freeze({}) });
  if (sources.length > MAX_BATCH_SIZE) throw new Error(`UK approved-source batch exceeds maximum of ${MAX_BATCH_SIZE}`);
  const concurrency = Math.min(3, Math.max(1, Number(options.concurrency || 2)));
  const now = options.now instanceof Date ? options.now : new Date(options.now || new Date().toISOString());
  const sharedFetcher = options.fetchWithPolicy || createPolicyFetcher({ fetchImpl: options.fetchImpl || fetch, timeoutMs: Number(options.timeout_ms || 15000) }).fetchWithPolicy;
  const results = await mapBounded(sources, concurrency, source => pollOneSource(source, {
    ...options,
    now,
    fetchWithPolicy: sharedFetcher
  }));
  return Object.freeze({
    source_count: results.length,
    passed_count: results.filter(item => item.status === 'passed').length,
    held_count: results.filter(item => item.status === 'held').length,
    rejected_count: results.filter(item => item.status === 'rejected').length,
    results: Object.freeze(results),
    reason_counts: Object.freeze(reasonCounts(results.filter(item => item.status !== 'passed')))
  });
}

export function summarizeApprovedSourcePoll(batchReports = [], options = {}) {
  const results = batchReports.flatMap(report => report.results || []);
  return Object.freeze({
    country: 'UK',
    mode: 'approved_source_cloudflare_read_only_poll',
    generated_at: options.generated_at || new Date().toISOString(),
    approved_registry_count: Number(options.approved_registry_count || APPROVED_SOURCES.length),
    direct_route_count: results.length,
    batch_count: batchReports.length,
    passed_count: results.filter(item => item.status === 'passed').length,
    held_count: results.filter(item => item.status === 'held').length,
    rejected_count: results.filter(item => item.status === 'rejected').length,
    customer_ready_count: results.filter(item => item.quality_status === 'customer_ready').length,
    serper_credits_used: 0,
    discovery_attempted: false,
    source_pr_attempted: false,
    opportunity_pr_attempted: false,
    publication_attempted: false,
    mutation_attempted: false,
    reason_counts: Object.freeze(reasonCounts(results.filter(item => item.status !== 'passed'))),
    results: Object.freeze(results)
  });
}

export const UK_APPROVED_SOURCE_POLL_LIMITS = Object.freeze({
  default_batch_size: DEFAULT_BATCH_SIZE,
  maximum_batch_size: MAX_BATCH_SIZE,
  maximum_body_bytes: MAX_BODY_BYTES
});
