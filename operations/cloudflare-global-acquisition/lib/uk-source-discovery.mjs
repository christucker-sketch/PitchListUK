import sourceDiscoveryLib from '../../opportunity-pipeline/acquisition/source-discovery.js';
import sourceOnboardingLib from '../../opportunity-pipeline/lib/source-onboarding.js';
import safetyLib from '../../opportunity-pipeline/lib/opportunity-safety.js';
import { discoverUkDirectSourceGraph } from './uk-direct-source-graph.mjs';

const { discoveryQueries } = sourceDiscoveryLib;
const { STATUS, PLATFORM_HOST, NON_SOURCE_HOST, classifySourceCandidate } = sourceOnboardingLib;
const { canonicalUrl } = safetyLib;

const DEFAULT_QUERY_LIMIT = 8;
const MAX_QUERY_LIMIT = 12;
const DEFAULT_RESULTS_PER_QUERY = 5;
const MAX_RESULTS_PER_QUERY = 8;
const DEFAULT_CANDIDATE_LIMIT = 30;
const MAX_CANDIDATE_LIMIT = 50;
const MAX_BODY_BYTES = 240000;
const MAX_REDIRECTS = 3;

function requireEnv(env, key) {
  const value = String(env?.[key] || '').trim();
  if (!value) throw new Error(`Missing required secret/config: ${key}`);
  return value;
}

function publicHttpsUrl(value) {
  let url;
  try { url = new URL(String(value || '')); } catch { throw new Error('candidate_url_invalid'); }
  if (url.protocol !== 'https:' || (url.port && url.port !== '443') || url.username || url.password) throw new Error('candidate_url_policy_rejected');
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':')) throw new Error('candidate_host_policy_rejected');
  if (PLATFORM_HOST.test(host) || NON_SOURCE_HOST.test(host)) throw new Error('candidate_host_policy_rejected');
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

async function timedFetch(fetchImpl, url, init, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetchImpl(url, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timeout); }
}

async function fetchWithSafeRedirects(fetchImpl, value, options = {}, redirects = 0) {
  const parsed = publicHttpsUrl(value);
  const response = await timedFetch(fetchImpl, parsed.toString(), {
    redirect: 'manual', headers: { 'user-agent': 'FindPitches-Global-Acquisition/1.0' }
  }, Number(options.timeout_ms || 15000));
  if (response.status >= 300 && response.status < 400 && response.headers?.get('location')) {
    if (redirects >= MAX_REDIRECTS) throw new Error('candidate_redirect_limit');
    return fetchWithSafeRedirects(fetchImpl, new URL(response.headers.get('location'), parsed).toString(), options, redirects + 1);
  }
  return response;
}

function parseRobots(text) {
  const disallow = [];
  let applies = false;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const [name, ...rest] = line.split(':');
    const value = rest.join(':').trim();
    if (/^user-agent$/i.test(name)) applies = value === '*' || /FindPitches|PitchListUKBot/i.test(value);
    else if (applies && /^disallow$/i.test(name) && value) disallow.push(value);
  }
  return disallow;
}

function robotsAllows(url, disallow = []) {
  const path = new URL(url).pathname;
  return !disallow.some(prefix => prefix === '/' || path.startsWith(prefix));
}

async function serperSearch(env, query, options = {}) {
  const num = Math.min(MAX_RESULTS_PER_QUERY, Math.max(1, Number(options.num || DEFAULT_RESULTS_PER_QUERY)));
  const response = await timedFetch(options.fetchImpl || fetch, 'https://google.serper.dev/search', {
    method: 'POST', headers: { 'content-type': 'application/json', 'X-API-KEY': requireEnv(env, 'SERPER_API_KEY') },
    body: JSON.stringify({ q: query, num, gl: 'uk', hl: 'en' })
  }, Number(options.timeout_ms || 15000));
  if (!response.ok) throw new Error(`Serper request failed with HTTP ${response.status}`);
  const raw = await response.json();
  return (raw.organic || []).slice(0, num).map((item, index) => ({ query, rank: index + 1, title: item.title || '', url: canonicalUrl(item.link || ''), snippet: item.snippet || '' })).filter(item => item.url?.startsWith('https://'));
}

function inferOpportunityType(text) {
  if (/christmas/i.test(text)) return 'christmas_market';
  if (/racecourse|venue/i.test(text)) return 'venue_trader_application';
  if (/county show|agricultural show/i.test(text)) return 'show_trader_application';
  if (/artisan/i.test(text)) return 'artisan_market';
  if (/festival/i.test(text)) return 'festival_trader_application';
  return 'recurring_market';
}

function inferOrganisation(title, host) {
  return String(title || '').replace(/\s*[|–—-]\s*(?:apply|applications?|traders?|stallholders?|vendors?|official).*$/i, '').trim() || host;
}

async function fetchCandidate(result, plan, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  let parsed;
  try { parsed = publicHttpsUrl(result.url); }
  catch (error) { return { result, plan, fetch_status: error.message, page_text: '', final_url: '' }; }
  let robots = [];
  try {
    const robotsResponse = await fetchWithSafeRedirects(fetchImpl, `${parsed.origin}/robots.txt`, options);
    robots = robotsResponse.ok ? parseRobots(await robotsResponse.text()) : [];
  } catch { return { result, plan, fetch_status: 'robots_unavailable', page_text: '', final_url: '' }; }
  if (!robotsAllows(parsed.toString(), robots)) return { result, plan, fetch_status: 'robots_disallowed', page_text: '', final_url: '' };
  try {
    const response = await fetchWithSafeRedirects(fetchImpl, parsed.toString(), options);
    if (!response.ok) return { result, plan, fetch_status: `http_${response.status}`, page_text: '', final_url: response.url || parsed.toString() };
    const html = (await response.text()).slice(0, MAX_BODY_BYTES);
    return { result, plan, fetch_status: 'fetched', page_text: stripHtml(html), final_url: canonicalUrl(response.url || parsed.toString()) };
  } catch (error) {
    return { result, plan, fetch_status: error?.name === 'AbortError' ? 'timeout' : String(error?.message || 'network_error'), page_text: '', final_url: '' };
  }
}

function candidateInput(outcome, now) {
  const result = outcome.result || {};
  const pageText = String(outcome.page_text || '');
  const route = canonicalUrl(outcome.final_url || result.url);
  let host = '';
  try { host = new URL(route).hostname.replace(/^www\./, ''); } catch {}
  return {
    url: route, title: result.title, snippet: result.snippet, page_text: pageText,
    organisation: inferOrganisation(result.title, host),
    organiser_type: /\.gov\.uk$/i.test(host) ? 'local-authority' : 'event-organiser',
    geographic_coverage: outcome.plan?.region || '',
    opportunity_type: inferOpportunityType(`${outcome.plan?.query || ''} ${result.title || ''} ${result.snippet || ''}`),
    discovery_query: outcome.plan?.query || result.query || '', discovered_at: now,
    first_party_evidence: /\.gov\.uk$/i.test(host) ? `Official public-service host ${host}` : `Retrieved canonical host ${host}`,
    trader_application_evidence: pageText.slice(0, 6000),
    robots_result: outcome.fetch_status === 'fetched' ? 'allowed' : outcome.fetch_status,
    terms_review_status: /\.gov\.uk$/i.test(host) ? 'public-service' : 'manual-review-required',
    fetch_status: outcome.fetch_status,
    recommended_polling_days: /market/i.test(pageText) ? 14 : 30
  };
}

export function autoApprovePublicServiceCandidates(candidates = [], options = {}) {
  const now = options.now || new Date().toISOString();
  return candidates.map(item => item.classification === STATUS.AUTO && item.approval_status === 'pending'
    ? Object.freeze({ ...item, approval_status: 'approved', reviewer_decision: 'approved_unambiguous_public_service_first_party', reviewer: 'FindPitches Cloudflare deterministic source automation', decision_timestamp: now })
    : item);
}

async function fetchAndClassify(items, payload, options, generatedAt) {
  const unique = [];
  const seen = new Set();
  const candidateLimit = Math.min(MAX_CANDIDATE_LIMIT, Math.max(1, Number(payload.candidate_limit || DEFAULT_CANDIDATE_LIMIT)));
  for (const item of items) {
    const route = canonicalUrl(item.result?.url);
    if (!route || seen.has(route)) continue;
    seen.add(route);
    unique.push({ ...item, result: { ...item.result, url: route } });
    if (unique.length >= candidateLimit) break;
  }
  const outcomes = [];
  const concurrency = Math.min(3, Math.max(1, Number(payload.concurrency || 2)));
  let cursor = 0;
  async function consume() {
    while (cursor < unique.length) {
      const index = cursor++;
      outcomes[index] = await (options.fetchCandidate || fetchCandidate)(unique[index].result, unique[index].plan, { fetchImpl: options.fetchImpl, timeout_ms: payload.timeout_ms });
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length || 1) }, consume));
  const classified = outcomes.map(outcome => classifySourceCandidate(candidateInput(outcome, generatedAt), { now: generatedAt }));
  return { outcomes, reviewed: autoApprovePublicServiceCandidates(classified, { now: generatedAt }) };
}

export async function runUkSourceDiscovery(env, payload = {}, options = {}) {
  const queryLimit = Math.min(MAX_QUERY_LIMIT, Math.max(1, Number(payload.query_limit || DEFAULT_QUERY_LIMIT)));
  const queryOffset = Math.max(0, Number(payload.query_offset || 0));
  const resultsPerQuery = Math.min(MAX_RESULTS_PER_QUERY, Math.max(1, Number(payload.results_per_query || DEFAULT_RESULTS_PER_QUERY)));
  const generatedAt = payload.as_of || new Date().toISOString();
  const seedRoutes = Array.isArray(payload.seed_routes) ? payload.seed_routes : [];

  const direct = await (options.directDiscovery || discoverUkDirectSourceGraph)(seedRoutes, {
    fetchImpl: options.fetchImpl, timeout_ms: payload.timeout_ms, max_seeds: payload.direct_seed_limit || 24, max_links: payload.candidate_limit || DEFAULT_CANDIDATE_LIMIT
  });
  let discoveryNetwork = 'cloudflare_direct_fetch';
  let serperCredits = 0;
  let plans = [];
  let items = (direct.candidates || []).map(result => ({ result, plan: { query: 'cloudflare-first-party-graph', region: 'UK trusted-source graph' } }));

  if (items.length === 0 && payload.serper_fallback !== false) {
    discoveryNetwork = 'serper_fallback';
    plans = discoveryQueries({ limit: queryLimit, offset: queryOffset });
    for (const plan of plans) {
      const found = await (options.search || serperSearch)(env, plan.query, { num: resultsPerQuery, fetchImpl: options.fetchImpl, timeout_ms: payload.timeout_ms });
      items.push(...found.map(result => ({ result, plan })));
    }
    serperCredits = plans.length;
  }

  const { outcomes, reviewed } = await fetchAndClassify(items, payload, options, generatedAt);
  const approved = reviewed.filter(item => item.approval_status === 'approved');
  const reviewQueue = reviewed.filter(item => item.classification === STATUS.REVIEW && item.approval_status === 'pending');
  const classifications = reviewed.reduce((counts, item) => ({ ...counts, [item.classification]: (counts[item.classification] || 0) + 1 }), {});

  return Object.freeze({
    country: 'UK', mode: 'uk_source_discovery_pr', generated_at: generatedAt,
    discovery_network: discoveryNetwork,
    direct_seed_count: Number(direct.seed_count || 0),
    direct_candidates_found: Number((direct.candidates || []).length),
    serper_fallback_used: serperCredits > 0,
    query_offset: queryOffset, query_count: plans.length, serper_credits_used: serperCredits,
    search_results: items.length, candidates_fetched: outcomes.length, candidates_classified: reviewed.length,
    auto_approved_count: approved.length, manual_review_count: reviewQueue.length,
    classifications: Object.freeze(classifications), approved_candidates: Object.freeze(approved), review_queue: Object.freeze(reviewQueue),
    production_opportunity_write_attempted: false, source_registry_write_attempted: false
  });
}

export const UK_SOURCE_DISCOVERY_LIMITS = Object.freeze({
  default_query_limit: DEFAULT_QUERY_LIMIT, maximum_query_limit: MAX_QUERY_LIMIT,
  default_results_per_query: DEFAULT_RESULTS_PER_QUERY, maximum_results_per_query: MAX_RESULTS_PER_QUERY,
  default_candidate_limit: DEFAULT_CANDIDATE_LIMIT, maximum_candidate_limit: MAX_CANDIDATE_LIMIT,
  maximum_body_bytes: MAX_BODY_BYTES
});
