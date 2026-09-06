import classifier from '../../opportunity-pipeline/lib/us-acquisition-classifier.js';
import { explicitApplicationDeadlines, explicitLiveEventDates } from '../../opportunity-pipeline/lib/us-state-staging-runner.js';
import { growthQueryBatch, growthPlanSize } from './us-growth-plan.js';

const { classifyUsOpportunityEvidence } = classifier;
const EXCLUDED_HOST = /(^|\.)(?:facebook|instagram|youtube|linkedin|reddit|yelp|eventbrite|10times|allevents|festivalnet|fairsandfestivals)\.(?:com|org)$/i;

function canonicalUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(key) || /^(?:srsltid|gclid|fbclid|dclid|msclkid|mc_cid|mc_eid)$/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    return url.toString().replace(/[/?]$/, '');
  } catch {
    return '';
  }
}

function hostFor(value) {
  try { return new URL(value).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; }
}

function slug(value) {
  return String(value || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70);
}

function shortHash(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function normaliseText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function titleFor(result, fetched) {
  return normaliseText(fetched?.title || result?.title || '').replace(/\s*[|–—]\s*[^|–—]+$/, '').slice(0, 160);
}

function organiserFor(title, host) {
  const cleaned = normaliseText(title)
    .replace(/\b(?:vendor|exhibitor|merchant|stallholder|food truck)\s+(?:application|registration|information|opportunity).*$/i, '')
    .replace(/\b(?:apply|applications?)\b.*$/i, '')
    .replace(/[|–—-]+$/, '')
    .trim();
  return cleaned || host;
}

function futureEventRange(text, year, asOfDate) {
  const dates = explicitLiveEventDates(text, String(year)).filter(date => date >= asOfDate);
  if (!dates.length) return { ok: false, reason: 'live_event_date_missing', dates };
  if (dates.length > 2) return { ok: false, reason: 'live_event_dates_ambiguous', dates };
  const start = dates[0];
  const end = dates[1] || start;
  const span = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000);
  if (!Number.isFinite(span) || span < 0 || span > 14) return { ok: false, reason: 'live_event_range_ambiguous', dates };
  return { ok: true, start, end, dates };
}

function pageAttestsPlace(text, plan) {
  const haystack = normaliseText(text).toLowerCase();
  return haystack.includes(plan.locality.toLowerCase()) && (
    haystack.includes(plan.state_name.toLowerCase()) || new RegExp(`\\b${plan.state_code.toLowerCase()}\\b`).test(haystack)
  );
}

function sourceClass(text, host) {
  if (/\.gov$/i.test(host) || /\b(?:city|county|parks and recreation|downtown development authority)\b/i.test(text)) return 'government-organisation';
  if (/\b(?:farmers? market|public market)\b/i.test(text)) return 'market-organisation';
  if (/\b(?:fair|festival)\b/i.test(text)) return 'festival-organisation';
  if (/\b(?:chamber of commerce|tourism|visitors bureau)\b/i.test(text)) return 'civic-organisation';
  return 'event-organisation';
}

export function candidateFromLivePage({ plan, result, fetched, state, asOfDate }) {
  const route = canonicalUrl(fetched?.url || result?.url);
  const host = hostFor(route);
  if (!route || !host) return { accepted: false, reason: 'invalid_route' };
  if (EXCLUDED_HOST.test(host)) return { accepted: false, reason: 'excluded_non_first_party_host' };
  const title = titleFor(result, fetched);
  const body = normaliseText(fetched?.text || fetched?.body || '');
  const text = normaliseText(`${title}\n${body}`);
  if (!pageAttestsPlace(body, plan)) return { accepted: false, reason: 'state_or_locality_not_attested' };
  const evidence = classifyUsOpportunityEvidence({ title, body: text, sourceUrl: route, applicationUrl: route });
  if (evidence.decision !== 'candidate') return { accepted: false, reason: evidence.reason, evidence };
  const range = futureEventRange(text, plan.year, asOfDate);
  if (!range.ok) return { accepted: false, reason: range.reason, live_event_dates: range.dates };
  if (!range.start.startsWith(String(plan.year))) return { accepted: false, reason: 'event_year_mismatch' };
  const deadlines = explicitApplicationDeadlines(text, String(plan.year));
  if (deadlines.length && deadlines.at(-1) < asOfDate) return { accepted: false, reason: 'application_deadline_passed', deadlines };
  const organiser = organiserFor(title, host);
  const idBase = `${state.code}-${slug(organiser || title)}-${range.start}-${shortHash(route)}`;
  const source = {
    id: idBase.slice(0, 100),
    name: /\b(?:vendor|exhibitor|merchant|stallholder|food truck)\b/i.test(title) ? title : `${title} Vendor Opportunity`,
    organiser,
    source_url: route,
    application_url: route,
    source_class: sourceClass(text, host),
    country_code: 'US',
    jurisdiction: `US-${state.code}`,
    region_code: state.code,
    locality: plan.locality,
    recurring: /\b(?:weekly|monthly|every (?:week|month)|farmers? market season)\b/i.test(text),
    multi_event: false,
    event_start: range.start,
    event_end: range.end,
    ...(deadlines.length === 1 && deadlines[0] >= asOfDate ? { application_deadline: deadlines[0] } : {}),
    status: 'approved-pilot',
    evidence: `Cloudflare discovery ${plan.id}: live first-party route attests ${plan.locality}, ${state.code}, actionable vendor terms, and exact event date${range.start === range.end ? '' : ' range'} ${range.start}${range.start === range.end ? '' : ` to ${range.end}`}.`
  };
  return {
    accepted: true,
    source,
    receipt: {
      source_id: source.id,
      query_id: plan.id,
      route,
      host,
      locality: plan.locality,
      state_code: state.code,
      live_event_dates: range.dates,
      live_application_deadlines: deadlines,
      positive_signals: evidence.positiveSignals
    }
  };
}

async function serperSearch(env, query, options = {}) {
  const key = String(env?.SERPER_API_KEY || '').trim();
  if (!key) throw new Error('Missing required secret/config: SERPER_API_KEY');
  const response = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key },
    body: JSON.stringify({ q: query, num: Math.max(1, Math.min(10, Number(options.num || 8))), gl: 'us', hl: 'en' }),
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`Serper request failed with HTTP ${response.status}`);
  const body = await response.json();
  return (body.organic || []).map((item, index) => ({
    rank: index + 1,
    title: String(item.title || ''),
    url: canonicalUrl(item.link),
    snippet: String(item.snippet || '')
  })).filter(item => item.url);
}

function reasonCounts(items) {
  return items.reduce((counts, item) => ({ ...counts, [item.reason]: (counts[item.reason] || 0) + 1 }), {});
}

export async function searchGrowthPlan(env, plan, options = {}) {
  const search = options.search || ((query, searchOptions) => serperSearch(env, query, searchOptions));
  const results = await search(plan.query, { num: options.searchNum || 8 });
  return {
    plan_id: plan.id,
    results: results.map(result => ({
      rank: Number(result.rank || 0),
      title: String(result.title || ''),
      url: canonicalUrl(result.url),
      snippet: String(result.snippet || '')
    })).filter(result => result.url)
  };
}

export function normalizeGrowthCandidates({ plans = [], searchBatches = [], existingSources = [], candidateCap = 16 } = {}) {
  const existingRoutes = new Set(existingSources.flatMap(source => [
    canonicalUrl(source.source_url),
    canonicalUrl(source.application_url)
  ]).filter(Boolean));
  const batchesByPlan = new Map(searchBatches.map(batch => [batch.plan_id, batch.results || []]));
  const unique = new Map();
  let resultsSeen = 0;
  for (const plan of plans) {
    const results = batchesByPlan.get(plan.id) || [];
    resultsSeen += results.length;
    for (const result of results) {
      const route = canonicalUrl(result.url);
      if (!route || existingRoutes.has(route)) continue;
      const key = route;
      if (!unique.has(key)) unique.set(key, { plan, result: { ...result, url: route } });
    }
  }
  const cap = Math.max(1, Math.min(24, Number(candidateCap || 16)));
  return {
    candidates: [...unique.values()].slice(0, cap),
    metrics: { results_seen: resultsSeen, unique_routes_considered: unique.size, candidates_selected: Math.min(unique.size, cap) }
  };
}

export function chunkGrowthCandidates(candidates = [], options = {}) {
  const batchSize = Math.max(1, Math.min(8, Number(options.batchSize || 4)));
  const batches = [];
  for (let index = 0; index < candidates.length; index += batchSize) batches.push(candidates.slice(index, index + batchSize));
  return batches;
}

export async function validateGrowthCandidateBatch({ candidates = [], state, asOfDate, fetchPage } = {}) {
  if (typeof fetchPage !== 'function') throw new Error('Cloudflare growth discovery requires injected live page fetch');
  const sources = [];
  const receipts = [];
  const held = [];
  let pagesFetched = 0;
  for (const item of candidates) {
    let fetched;
    try {
      fetched = await fetchPage({ url: item.result.url, source_id: item.plan.id });
      pagesFetched += 1;
    } catch {
      held.push({ query_id: item.plan.id, route: item.result.url, reason: 'fetch_failed' });
      continue;
    }
    const verdict = candidateFromLivePage({ ...item, fetched, state, asOfDate });
    if (!verdict.accepted) {
      held.push({ query_id: item.plan.id, route: item.result.url, reason: verdict.reason });
      continue;
    }
    sources.push(verdict.source);
    receipts.push(verdict.receipt);
  }
  return { sources, receipts, held, pages_fetched: pagesFetched };
}

export function finalizeGrowthDiscovery({ plans = [], validationBatches = [], planSize = 0, queryOffset = 0, searchMetrics = {} } = {}) {
  const sources = [];
  const receipts = [];
  const held = validationBatches.flatMap(batch => batch.held || []);
  let pagesFetched = 0;
  for (const batch of validationBatches) {
    pagesFetched += Number(batch.pages_fetched || 0);
    for (let index = 0; index < (batch.sources || []).length; index += 1) {
      const source = batch.sources[index];
      const receipt = (batch.receipts || [])[index];
      if (sources.some(item => item.id === source.id || item.application_url === source.application_url)) {
        held.push({ query_id: receipt?.query_id, route: source.application_url, reason: 'in_batch_duplicate' });
        continue;
      }
      sources.push(source);
      if (receipt) receipts.push(receipt);
    }
  }
  return {
    plans,
    sources,
    receipts,
    held,
    held_reasons: reasonCounts(held),
    metrics: {
      plan_size: Number(planSize || plans.length),
      query_offset: Math.max(0, Number(queryOffset || 0)),
      queries_used: plans.length,
      results_seen: Number(searchMetrics.results_seen || 0),
      unique_routes_considered: Number(searchMetrics.unique_routes_considered || 0),
      candidates_selected: Number(searchMetrics.candidates_selected || 0),
      pages_fetched: pagesFetched,
      validation_batches: validationBatches.length,
      sources_generated: sources.length
    }
  };
}

export async function discoverGrowthSources(env, state, options = {}) {
  const asOfDate = String(options.asOfDate || new Date().toISOString()).slice(0, 10);
  const plans = growthQueryBatch(state, { offset: options.queryOffset, limit: options.queryLimit, years: options.years });
  if (!plans.length) return { plans, sources: [], receipts: [], held: [], metrics: { plan_size: growthPlanSize(state, { years: options.years }), queries_used: 0, results_seen: 0, pages_fetched: 0 } };
  const fetchPage = options.fetchPage;
  const searchBatches = [];
  for (const plan of plans) searchBatches.push(await searchGrowthPlan(env, plan, options));
  const normalized = normalizeGrowthCandidates({
    plans,
    searchBatches,
    existingSources: options.existingSources,
    candidateCap: options.candidateCap
  });
  const validationBatches = [];
  for (const candidates of chunkGrowthCandidates(normalized.candidates, { batchSize: options.candidateBatchSize })) {
    validationBatches.push(await validateGrowthCandidateBatch({ candidates, state, asOfDate, fetchPage }));
  }
  return finalizeGrowthDiscovery({
    plans,
    validationBatches,
    planSize: growthPlanSize(state, { years: options.years }),
    queryOffset: options.queryOffset,
    searchMetrics: normalized.metrics
  });
}
