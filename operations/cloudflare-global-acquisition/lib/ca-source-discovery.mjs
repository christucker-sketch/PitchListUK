import { createHash } from 'node:crypto';

import { canadaDiscoveryQueries, CA_DISCOVERY_PLAN_SIZE, nextCanadaDiscoveryOffset } from './ca-source-discovery-plan.mjs';
import { evaluateCanadaSourceEvidence } from './ca-source-evidence.mjs';

const MAX_RESULTS_PER_QUERY = 8;
const MAX_CANDIDATES = 48;
const MAX_BODY_BYTES = 240000;
const MAX_REDIRECTS = 3;
const INTERNAL_SERPER_URL = 'https://findpitches-serper.internal/search';
const INTERNAL_SERPER_MARKER = 'findpitches-service-binding-v1';

function canonicalHttpsUrl(value) {
  let url;
  try { url = new URL(String(value || '')); } catch { throw new Error('canada_candidate_url_invalid'); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw new Error('canada_candidate_url_policy_rejected');
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':')) {
    throw new Error('canada_candidate_host_policy_rejected');
  }
  url.hash = '';
  return url.toString();
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&amp;|&quot;|&#39;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function timedFetch(fetchImpl, url, init = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetchImpl(url, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timeout); }
}

async function fetchCandidatePage(fetchImpl, value, timeoutMs, redirects = 0) {
  const url = canonicalHttpsUrl(value);
  const response = await timedFetch(fetchImpl, url, { redirect: 'manual', headers: { 'user-agent': 'FindPitches-Canada-Acquisition/2.0' } }, timeoutMs);
  if (response.status >= 300 && response.status < 400 && response.headers?.get('location')) {
    if (redirects >= MAX_REDIRECTS) throw new Error('canada_candidate_redirect_limit');
    const next = new URL(response.headers.get('location'), url).toString();
    return fetchCandidatePage(fetchImpl, next, timeoutMs, redirects + 1);
  }
  if (!response.ok) throw new Error(`canada_candidate_http_${response.status}`);
  return {
    url: canonicalHttpsUrl(response.url || url),
    text: stripHtml((await response.text()).slice(0, MAX_BODY_BYTES))
  };
}

async function serviceSearch(env, query, num = 5) {
  if (!env?.SERPER_BROKER) throw new Error('canada_serper_broker_binding_missing');
  const response = await env.SERPER_BROKER.fetch(new Request(INTERNAL_SERPER_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-findpitches-internal-service': INTERNAL_SERPER_MARKER },
    body: JSON.stringify({ market: 'CA', q: query, num: Math.min(MAX_RESULTS_PER_QUERY, Math.max(1, Number(num || 5))) })
  }));
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok !== true || !Array.isArray(body.results)) throw new Error(body?.error || `canada_serper_broker_http_${response.status}`);
  return body.results;
}

function stableSourceId(regionCode, url) {
  const digest = createHash('sha256').update(`${regionCode}\n${url}`).digest('hex').slice(0, 12);
  return `ca-${String(regionCode).toLowerCase()}-${digest}`;
}

function toApprovedSource(result, plan, page, evidence, now) {
  const sourceUrl = evidence.source_url || page.url;
  const sourceClass = evidence.source_class || 'event-organiser';
  return Object.freeze({
    id: stableSourceId(evidence.region_code, sourceUrl),
    name: String(result.title || `${evidence.region_name} vendor opportunity`).trim(),
    source_url: sourceUrl,
    application_url: evidence.application_url || sourceUrl,
    source_class: sourceClass,
    country_code: 'CA',
    jurisdiction: evidence.jurisdiction,
    region_code: evidence.region_code,
    region_name: evidence.region_name,
    status: 'approved-pilot',
    discovered_at: now,
    discovery_query: plan.query,
    evidence: `Cloudflare Canada opportunity-first discovery ${plan.template_id}: ${evidence.reason}; route attests ${evidence.region_name} and actionable vendor application evidence.`
  });
}

export async function runCanadaSourceDiscovery(env, payload = {}, options = {}) {
  const queryOffset = Math.max(0, Number(payload.query_offset || 0)) % CA_DISCOVERY_PLAN_SIZE;
  const queryLimit = Math.min(12, Math.max(1, Number(payload.query_limit || 4)));
  const resultsPerQuery = Math.min(MAX_RESULTS_PER_QUERY, Math.max(1, Number(payload.results_per_query || 8)));
  const candidateLimit = Math.min(MAX_CANDIDATES, Math.max(1, Number(payload.candidate_limit || 40)));
  const timeoutMs = Math.min(30000, Math.max(1000, Number(payload.timeout_ms || 15000)));
  const generatedAt = String(payload.as_of || new Date().toISOString());
  const plans = canadaDiscoveryQueries({ offset: queryOffset, limit: queryLimit });
  const search = options.search || ((query, num) => serviceSearch(env, query, num));
  const fetchImpl = options.fetchImpl || fetch;

  const candidates = [];
  const seen = new Set();
  let resultsSeen = 0;
  for (const plan of plans) {
    const results = await search(plan.query, resultsPerQuery);
    resultsSeen += results.length;
    for (const raw of results) {
      let url;
      try { url = canonicalHttpsUrl(raw.link || raw.url); } catch { continue; }
      if (seen.has(url)) continue;
      seen.add(url);
      candidates.push({ plan, result: { title: String(raw.title || ''), snippet: String(raw.snippet || ''), url } });
      if (candidates.length >= candidateLimit) break;
    }
    if (candidates.length >= candidateLimit) break;
  }

  const approved = [];
  const review = [];
  const held = [];
  for (const candidate of candidates) {
    let page;
    try {
      page = options.fetchCandidate
        ? await options.fetchCandidate(candidate.result.url, candidate.plan)
        : await fetchCandidatePage(fetchImpl, candidate.result.url, timeoutMs);
    } catch (error) {
      held.push(Object.freeze({ url: candidate.result.url, region_code: candidate.plan.region_code, reason: String(error?.message || error) }));
      continue;
    }
    const evidence = evaluateCanadaSourceEvidence({
      region_code: candidate.plan.region_code,
      source_url: page.url || candidate.result.url,
      application_url: page.url || candidate.result.url,
      title: candidate.result.title,
      snippet: candidate.result.snippet,
      page_text: page.text || ''
    });
    if (evidence.status === 'approved') approved.push(toApprovedSource(candidate.result, candidate.plan, page, evidence, generatedAt));
    else if (evidence.status === 'review') review.push(Object.freeze({ url: page.url || candidate.result.url, region_code: candidate.plan.region_code, reason: evidence.reason }));
    else held.push(Object.freeze({ url: page.url || candidate.result.url, region_code: candidate.plan.region_code, reason: evidence.reason }));
  }

  const uniqueApproved = [...new Map(approved.map(source => [source.id, source])).values()];
  const nextOffset = nextCanadaDiscoveryOffset(queryOffset, plans.length);
  return Object.freeze({
    country: 'CA',
    mode: 'ca_source_discovery',
    discovery_strategy: 'opportunity_first_with_source_promotion',
    generated_at: generatedAt,
    query_offset: queryOffset,
    next_query_offset: nextOffset,
    query_count: plans.length,
    plan_size: CA_DISCOVERY_PLAN_SIZE,
    serper_credits_used: plans.length,
    search_results: resultsSeen,
    search_candidates: candidates.length,
    unique_routes_considered: seen.size,
    approved_source_count: uniqueApproved.length,
    deterministic_first_party_count: uniqueApproved.filter(source => source.source_class === 'event-organiser').length,
    public_service_count: uniqueApproved.filter(source => source.source_class === 'public-service').length,
    manual_review_count: review.length,
    held_count: held.length,
    growth_health: uniqueApproved.length > 0 ? 'productive' : (resultsSeen > 0 ? 'zero_yield' : 'no_search_results'),
    approved_sources: Object.freeze(uniqueApproved),
    review_queue: Object.freeze(review),
    held: Object.freeze(held),
    production_opportunity_write_attempted: false,
    source_registry_write_attempted: false
  });
}

export const CA_SOURCE_DISCOVERY_LIMITS = Object.freeze({
  maximum_query_limit: 12,
  maximum_results_per_query: MAX_RESULTS_PER_QUERY,
  maximum_candidates: MAX_CANDIDATES,
  maximum_body_bytes: MAX_BODY_BYTES
});