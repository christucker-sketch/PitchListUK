import { createHash } from 'node:crypto';

import { evaluateCanadaSourceEvidence } from './ca-source-evidence.mjs';

const MAX_BODY_BYTES = 240000;
const MAX_REDIRECTS = 3;
const VENDOR_SIGNAL = /\b(vendor|vendors|exhibitor|exhibitors|booth|booths|concession|concessions|food truck|food trucks|market vendor|market vendors|artisan|artisans)\b/i;
const ACTION_SIGNAL = /\b(apply|application|applications|register|registration|book|booking|submit|form|deadline|fees?|rates?)\b/i;
const NEGATIVE_SIGNAL = /\b(closed to vendors|applications? closed|no vendors?|not accepting vendors?|cancelled|canceled)\b/i;

function canonicalHttpsUrl(value) {
  const url = new URL(String(value || ''));
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw new Error('ca_opportunity_url_invalid');
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!host || host === 'localhost' || host.endsWith('.local') || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':')) throw new Error('ca_opportunity_host_invalid');
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

async function timedFetch(fetchImpl, url, init, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetchImpl(url, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timeout); }
}

async function fetchPage(fetchImpl, value, timeoutMs, redirects = 0) {
  const url = canonicalHttpsUrl(value);
  const response = await timedFetch(fetchImpl, url, {
    redirect: 'manual',
    headers: { 'user-agent': 'FindPitches-Canada-Acquisition/1.0' }
  }, timeoutMs);
  if (response.status >= 300 && response.status < 400 && response.headers?.get('location')) {
    if (redirects >= MAX_REDIRECTS) throw new Error('ca_opportunity_redirect_limit');
    return fetchPage(fetchImpl, new URL(response.headers.get('location'), url).toString(), timeoutMs, redirects + 1);
  }
  if (!response.ok) throw new Error(`ca_opportunity_http_${response.status}`);
  return Object.freeze({
    url: canonicalHttpsUrl(response.url || url),
    text: stripHtml((await response.text()).slice(0, MAX_BODY_BYTES))
  });
}

function stableOpportunityId(source, route) {
  const digest = createHash('sha256')
    .update(`${source.region_code}\n${route}\n${String(source.name || '').trim()}`)
    .digest('hex')
    .slice(0, 12)
    .toUpperCase();
  return `CA-OPP-${digest}`;
}

function categories(text) {
  const values = [];
  if (/food truck|food vendor|food vendors|catering/i.test(text)) values.push('food vendors', 'food trucks');
  if (/artisan|craft|maker/i.test(text)) values.push('artisans', 'makers');
  if (/exhibitor/i.test(text)) values.push('exhibitors');
  if (/market vendor|vendor|vendors/i.test(text)) values.push('market vendors');
  return [...new Set(values.length ? values : ['vendors'])].join('; ');
}

function routeType(text) {
  if (/christmas|holiday market/i.test(text)) return 'seasonal_market';
  if (/festival/i.test(text)) return 'festival_vendor_application';
  if (/farmers? market/i.test(text)) return 'farmers_market';
  if (/market/i.test(text)) return 'market_vendor_application';
  return 'vendor_application';
}

function sourceHost(value) {
  try { return new URL(value).hostname.replace(/^www\./, ''); }
  catch { return ''; }
}

export function buildCanadaOpportunityRow(source, page, { now = new Date().toISOString() } = {}) {
  if (!source || source.country_code !== 'CA' || source.status !== 'approved-pilot') throw new Error('ca_opportunity_source_not_approved');
  const route = canonicalHttpsUrl(page?.url || source.application_url || source.source_url);
  const text = String(page?.text || '');
  const evidence = evaluateCanadaSourceEvidence({
    region_code: source.region_code,
    source_url: source.source_url,
    application_url: route,
    title: source.name,
    page_text: text,
    region: source.region_name
  });
  if (evidence.status !== 'approved') throw new Error(`ca_opportunity_source_revalidation_failed:${evidence.reason}`);
  if (NEGATIVE_SIGNAL.test(text)) throw new Error('ca_opportunity_negative_vendor_signal');
  if (!VENDOR_SIGNAL.test(text) || !ACTION_SIGNAL.test(text)) throw new Error('ca_opportunity_actionable_vendor_evidence_missing');

  const day = String(now).slice(0, 10);
  const title = String(source.name || `${source.region_name} vendor opportunity`).trim();
  const host = sourceHost(route);
  return Object.freeze({
    id: stableOpportunityId(source, route),
    event_name: title,
    organiser: host,
    location: source.region_name,
    county: '',
    region: source.region_name,
    event_start: '',
    event_end: '',
    application_deadline: '',
    stall_fee: '',
    vendor_categories: categories(`${title} ${text}`),
    last_checked: day,
    freshness_status: 'fresh',
    freshness_age_days: 0,
    confidence: 'high',
    quality_status: 'customer_ready',
    publishable: true,
    area_confidence: 'exact',
    route_type: routeType(`${title} ${text}`),
    organiser_type: 'public_service',
    country: 'Canada',
    jurisdiction: source.jurisdiction,
    currency: 'CAD',
    market_domain: 'findpitches.com',
    tax_region: source.jurisdiction,
    buyer_fit_tags: `canada;${String(source.region_code || '').toLowerCase()};vendor_application`,
    notes: `Official Canadian public-service vendor route revalidated by FindPitches on ${day}.`,
    application_url: route,
    source_url: canonicalHttpsUrl(source.source_url)
  });
}

export async function pollCanadaApprovedSource(source, options = {}) {
  const timeoutMs = Math.min(30000, Math.max(1000, Number(options.timeout_ms || 12000)));
  const fetchImpl = options.fetchImpl || fetch;
  try {
    const page = options.fetchPage
      ? await options.fetchPage(source.application_url || source.source_url, source)
      : await fetchPage(fetchImpl, source.application_url || source.source_url, timeoutMs);
    const row = buildCanadaOpportunityRow(source, page, { now: options.now });
    return Object.freeze({ source_id: source.id, status: 'passed', row });
  } catch (error) {
    return Object.freeze({ source_id: source?.id || null, status: 'held', reason: String(error?.message || error) });
  }
}

export async function pollCanadaApprovedSources(sources = [], options = {}) {
  const unique = [];
  const seen = new Set();
  for (const source of sources || []) {
    if (!source?.id || seen.has(source.id)) continue;
    seen.add(source.id);
    unique.push(source);
  }
  const concurrency = Math.min(4, Math.max(1, Number(options.concurrency || 3)));
  const results = new Array(unique.length);
  let cursor = 0;
  async function consume() {
    while (cursor < unique.length) {
      const index = cursor++;
      results[index] = await pollCanadaApprovedSource(unique[index], options);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length || 1) }, consume));
  const passed = results.filter(item => item?.status === 'passed');
  const held = results.filter(item => item?.status !== 'passed');
  return Object.freeze({
    source_count: unique.length,
    passed_count: passed.length,
    held_count: held.length,
    rows: Object.freeze(passed.map(item => item.row)),
    held: Object.freeze(held),
    serper_credits_used: 0
  });
}

export const CA_OPPORTUNITY_ACQUISITION_LIMITS = Object.freeze({
  maximum_body_bytes: MAX_BODY_BYTES,
  maximum_redirects: MAX_REDIRECTS,
  maximum_concurrency: 4
});
