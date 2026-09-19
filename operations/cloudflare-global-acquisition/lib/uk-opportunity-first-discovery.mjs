import sourceOnboardingLib from '../../opportunity-pipeline/lib/source-onboarding.js';
import lanesLib from '../../opportunity-pipeline/acquisition/lanes.js';
import safetyLib from '../../opportunity-pipeline/lib/opportunity-safety.js';
import geoNormaliseLib from '../../opportunity-pipeline/lib/geo-normalise.js';
import { searchViaSerperBroker } from './service-serper-search.mjs';

const { STATUS, PLATFORM_HOST, NON_SOURCE_HOST, classifySourceCandidate } = sourceOnboardingLib;
const { LANES } = lanesLib;
const { canonicalUrl } = safetyLib;
const { inferKnownCounty } = geoNormaliseLib;

const MAX_BODY_BYTES = 240000;
const MAX_REDIRECTS = 3;
const DEFAULT_QUERY_LIMIT = 4;
const MAX_QUERY_LIMIT = 8;
const DEFAULT_RESULTS_PER_QUERY = 8;
const MAX_CANDIDATES = 48;

const REGIONS = Object.freeze([
  'UK', 'England', 'Scotland', 'Wales', 'Northern Ireland', 'London', 'South East England', 'South West England',
  'East of England', 'West Midlands', 'East Midlands', 'North West England', 'North East England', 'Yorkshire',
  'Manchester', 'Liverpool', 'Leeds', 'Sheffield', 'Birmingham', 'Bristol', 'Newcastle', 'Nottingham',
  'Cardiff', 'Glasgow', 'Edinburgh', 'Belfast', 'Kent', 'Surrey', 'Sussex', 'Devon', 'Cornwall',
  'Norfolk', 'Suffolk', 'Essex', 'Hampshire', 'Cheshire', 'Lancashire', 'Cumbria', 'Dorset', 'Somerset',
  'Oxfordshire', 'Cambridgeshire', 'Lincolnshire', 'Northumberland', 'County Durham', 'Tyne and Wear',
  'South Yorkshire', 'Buckinghamshire'
]);

export const UK_OPPORTUNITY_QUERY_TEMPLATES = Object.freeze([
  region => `"${region}" "trader applications" market festival 2026 2027 -site:facebook.com -site:instagram.com -site:eventbrite.co.uk -site:eventbrite.com`,
  region => `"${region}" "stallholder applications" market festival fair 2026 2027 -site:facebook.com -site:instagram.com -site:eventbrite.com`,
  region => `"${region}" "vendor application" food festival market 2026 2027 -site:facebook.com -site:instagram.com -site:eventbrite.com`,
  region => `"${region}" "apply to trade" festival market fair 2026 2027 -site:facebook.com -site:instagram.com -site:eventbrite.com`,
  region => `"${region}" "become a trader" market festival 2026 2027 -site:facebook.com -site:instagram.com -site:eventbrite.com`,
  region => `"${region}" "food trader application" festival market 2026 2027 -site:facebook.com -site:instagram.com -site:eventbrite.com`,
  region => `"${region}" "exhibitor application" show festival 2026 2027 -site:facebook.com -site:instagram.com -site:eventbrite.com`,
  region => `"${region}" "Christmas market" stallholder application 2026 -site:facebook.com -site:instagram.com -site:eventbrite.com`
]);

function inferPlanRegion(lane, query) {
  const explicit = String(lane?.area || '').trim();
  if (explicit) return explicit;
  const haystack = `${lane?.title || ''} ${query || ''}`.toLowerCase();
  const match = [...REGIONS]
    .sort((a, b) => b.length - a.length)
    .find(region => haystack.includes(region.toLowerCase()));
  return match || 'UK';
}

function buildHalLanePlan() {
  return [...LANES]
    .filter(lane => !lane?.country || lane.country === 'United Kingdom')
    .sort((a, b) => Number(b?.priority || 0) - Number(a?.priority || 0))
    .flatMap(lane => (Array.isArray(lane?.queries) ? lane.queries : []).filter(Boolean).map((query, queryIndex) => Object.freeze({
      id: `uk-hal-${lane.id}-${queryIndex + 1}`,
      lane_id: lane.id,
      lane_title: lane.title,
      lane_priority: Number(lane.priority || 0),
      region: inferPlanRegion(lane, query),
      query
    })));
}

function buildGenericPlan() {
  return REGIONS.flatMap(region => UK_OPPORTUNITY_QUERY_TEMPLATES.map((build, templateIndex) => Object.freeze({
    id: `uk-opportunity-${String(region).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${templateIndex + 1}`,
    lane_id: 'cloud-generic-opportunity',
    lane_title: 'Cloud generic opportunity discovery',
    lane_priority: 0,
    region,
    query: build(region)
  })));
}

export function buildUkOpportunityPlan() {
  const byQuery = new Map();
  for (const item of [...buildHalLanePlan(), ...buildGenericPlan()]) {
    const key = String(item.query || '').trim().toLowerCase();
    if (key && !byQuery.has(key)) byQuery.set(key, item);
  }
  return Object.freeze([...byQuery.values()]);
}

export const UK_OPPORTUNITY_PLAN_SIZE = buildUkOpportunityPlan().length;

function publicHttpsUrl(value) {
  const url = new URL(String(value || ''));
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw new Error('opportunity_url_policy_rejected');
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':')) throw new Error('opportunity_host_policy_rejected');
  if (PLATFORM_HOST.test(host) || NON_SOURCE_HOST.test(host)) throw new Error('opportunity_host_policy_rejected');
  url.hash = '';
  return url;
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

async function fetchPage(fetchImpl, value, timeoutMs, redirects = 0) {
  const parsed = publicHttpsUrl(value);
  const response = await fetchImpl(parsed.toString(), {
    redirect: 'manual',
    headers: { 'user-agent': 'FindPitches-Opportunity-Discovery/1.0' },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (response.status >= 300 && response.status < 400 && response.headers?.get('location')) {
    if (redirects >= MAX_REDIRECTS) throw new Error('opportunity_redirect_limit');
    return fetchPage(fetchImpl, new URL(response.headers.get('location'), parsed).toString(), timeoutMs, redirects + 1);
  }
  if (!response.ok) throw new Error(`opportunity_http_${response.status}`);
  return Object.freeze({
    url: canonicalUrl(response.url || parsed.toString()),
    text: stripHtml((await response.text()).slice(0, MAX_BODY_BYTES))
  });
}

function inferOpportunityType(text) {
  if (/christmas/i.test(text)) return 'christmas_market';
  if (/county show|agricultural show|exhibitor/i.test(text)) return 'show_trader_application';
  if (/festival/i.test(text)) return 'festival_trader_application';
  if (/food/i.test(text)) return 'food_trader_application';
  return 'recurring_market';
}

function organisation(result, route) {
  let host = '';
  try { host = new URL(route).hostname.replace(/^www\./, ''); } catch {}
  return String(result.title || '')
    .replace(/\s*[|–—-]\s*(?:trader|stallholder|vendor|exhibitor|application|apply).*$/i, '')
    .trim() || host;
}

const INFORMATIONAL_NON_OPPORTUNITY = /(?:job profiles?|explore careers|career path|careers service|salary|skills|training|how to become)/i;
const ACTIONABLE_TRADER_APPLICATION = /(?:(?:trader|vendor|stallholder|exhibitor|concession|food[-\s]?trader|food[-\s]?vendor).{0,140}(?:apply|applications?|register|registration|book(?:ing)?|pitch)|(?:apply|applications?|register|registration|book(?:ing)?).{0,140}(?:trader|vendor|stallholder|exhibitor|concession|pitch))/i;

export function hasUkActionableOpportunityEvidence({ route = '', title = '', snippet = '', pageText = '' } = {}) {
  const path = (() => { try { return new URL(String(route || '')).pathname; } catch { return ''; } })();
  const text = `${title} ${snippet} ${pageText}`;
  if (/\/job-profiles?\//i.test(path)) return false;
  if (INFORMATIONAL_NON_OPPORTUNITY.test(text) && !ACTIONABLE_TRADER_APPLICATION.test(text)) return false;
  return ACTIONABLE_TRADER_APPLICATION.test(text);
}

function promoteCandidate(candidate, now) {
  if (candidate.classification === STATUS.AUTO && candidate.approval_status === 'pending') {
    return Object.freeze({ ...candidate, approval_status: 'approved', reviewer_decision: 'approved_public_service_opportunity', reviewer: 'FindPitches Cloudflare deterministic opportunity evidence', decision_timestamp: now });
  }
  if (candidate.classification === STATUS.REVIEW && candidate.rejection_reason === 'private_or_non_public_service_source_requires_review' && candidate.approval_status === 'pending') {
    return Object.freeze({ ...candidate, approval_status: 'approved', reviewer_decision: 'approved_deterministic_first_party_live_trader_route', reviewer: 'FindPitches Cloudflare deterministic opportunity evidence', decision_timestamp: now });
  }
  return candidate;
}

export async function runUkOpportunityFirstDiscovery(env, payload = {}, options = {}) {
  const plan = buildUkOpportunityPlan();
  const queryOffset = Math.max(0, Number(payload.query_offset || 0)) % plan.length;
  const queryLimit = Math.min(MAX_QUERY_LIMIT, Math.max(1, Number(payload.query_limit || DEFAULT_QUERY_LIMIT)));
  const resultsPerQuery = Math.min(8, Math.max(1, Number(payload.results_per_query || DEFAULT_RESULTS_PER_QUERY)));
  const candidateLimit = Math.min(MAX_CANDIDATES, Math.max(1, Number(payload.candidate_limit || MAX_CANDIDATES)));
  const timeoutMs = Math.min(20000, Math.max(5000, Number(payload.timeout_ms || 12000)));
  const now = String(payload.as_of || new Date().toISOString());
  const queries = Array.from({ length: queryLimit }, (_, index) => plan[(queryOffset + index) % plan.length]);
  const search = options.search || ((query, searchOptions) => searchViaSerperBroker(env, query, searchOptions));
  const fetchImpl = options.fetchImpl || fetch;

  const candidates = [];
  const seen = new Set();
  let resultsSeen = 0;
  for (const item of queries) {
    const results = await search(item.query, { num: resultsPerQuery });
    resultsSeen += results.length;
    for (const result of results) {
      const route = canonicalUrl(result.url || result.link);
      if (!route || seen.has(route)) continue;
      seen.add(route);
      candidates.push({ plan: item, result: { ...result, url: route } });
      if (candidates.length >= candidateLimit) break;
    }
    if (candidates.length >= candidateLimit) break;
  }

  const approved = [];
  const review = [];
  const held = [];
  for (const item of candidates) {
    let page;
    try {
      page = options.fetchPage ? await options.fetchPage(item.result.url, item.plan) : await fetchPage(fetchImpl, item.result.url, timeoutMs);
    } catch (error) {
      held.push(Object.freeze({ route: item.result.url, query_id: item.plan.id, reason: String(error?.message || error) }));
      continue;
    }
    let host = '';
    try { host = new URL(page.url || item.result.url).hostname.replace(/^www\./, ''); } catch {}
    if (!hasUkActionableOpportunityEvidence({
      route: page.url || item.result.url,
      title: item.result.title,
      snippet: item.result.snippet,
      pageText: page.text
    })) {
      held.push(Object.freeze({ route: page.url || item.result.url, query_id: item.plan.id, reason: 'non_actionable_or_informational_result' }));
      continue;
    }
    const inferredGeography = inferKnownCounty(item.result.title, item.result.snippet, page.text, page.url || item.result.url);
    const classified = promoteCandidate(classifySourceCandidate({
      url: page.url || item.result.url,
      title: item.result.title,
      snippet: item.result.snippet,
      page_text: page.text,
      organisation: organisation(item.result, page.url || item.result.url),
      organiser_type: /\.gov\.uk$/i.test(host) ? 'local-authority' : 'event-organiser',
      geographic_coverage: inferredGeography !== 'Unknown' ? inferredGeography : item.plan.region,
      opportunity_type: inferOpportunityType(`${item.plan.query} ${item.result.title || ''} ${item.result.snippet || ''} ${page.text || ''}`),
      discovery_query: item.plan.query,
      discovered_at: now,
      first_party_evidence: `Live search result and canonical page retrieved from ${host}`,
      trader_application_evidence: String(page.text || '').slice(0, 6000),
      robots_result: 'allowed',
      terms_review_status: /\.gov\.uk$/i.test(host) ? 'public-service' : 'deterministic-first-party',
      fetch_status: 'fetched',
      recommended_polling_days: /market/i.test(page.text || '') ? 14 : 30
    }, { now }), now);
    if (classified.approval_status === 'approved') approved.push(classified);
    else if (classified.classification === STATUS.REVIEW) review.push(classified);
    else held.push(Object.freeze({ route: item.result.url, query_id: item.plan.id, reason: classified.rejection_reason || classified.classification }));
  }

  return Object.freeze({
    country: 'UK',
    mode: 'uk_opportunity_first_discovery',
    generated_at: now,
    query_offset: queryOffset,
    next_query_offset: (queryOffset + queries.length) % plan.length,
    plan_size: plan.length,
    query_count: queries.length,
    serper_credits_used: queries.length,
    results_seen: resultsSeen,
    unique_routes_considered: seen.size,
    candidates_fetched: candidates.length,
    approved_count: approved.length,
    review_count: review.length,
    held_count: held.length,
    approved_candidates: Object.freeze(approved),
    review_queue: Object.freeze(review),
    held: Object.freeze(held)
  });
}
