import { buildUkCloudflareCanaryPlan } from './uk-cloudflare-canary.mjs';

const APPLICATION_SIGNAL = /(apply|application|trader|stallholder|vendor|pitch|market|concession|street\s*trading)/i;

function normalizeHost(value) {
  return new URL(value).hostname.toLowerCase().replace(/^www\./, '');
}

function extractTitle(html) {
  const match = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return String(match?.[1] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240);
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRobots(text) {
  const disallow = [];
  let applies = false;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const [name, ...rest] = line.split(':');
    const value = rest.join(':').trim();
    if (/^user-agent$/i.test(name)) applies = value === '*' || /PitchListUKBot/i.test(value) || /FindPitchesBot/i.test(value);
    else if (applies && /^disallow$/i.test(name) && value) disallow.push(value);
  }
  return disallow;
}

function robotsAllows(url, disallow) {
  const path = new URL(url).pathname;
  return !disallow.some(prefix => prefix === '/' || path.startsWith(prefix));
}

export function assertUkCanaryHealthGate(gate = {}, options = {}) {
  const now = Date.parse(options.now || new Date().toISOString());
  const maxAgeMs = Math.max(60_000, Number(options.max_age_ms || 15 * 60_000));
  const checkedAt = Date.parse(gate.checked_at || '');
  if (gate.status !== 'passed' || gate.control_plane_healthy !== true) throw new Error('UK Cloudflare canary control-plane health gate has not passed');
  if (gate.trigger_probe_passed !== true || gate.describe_probe_passed !== true) throw new Error('UK Cloudflare canary requires successful trigger and describe probes');
  if (!Number.isFinite(checkedAt) || checkedAt > now || now - checkedAt > maxAgeMs) throw new Error('UK Cloudflare canary health gate is stale or invalid');
  if (!String(gate.verifier || '').trim()) throw new Error('UK Cloudflare canary health gate requires verifier identity');
  return true;
}

async function fetchCanaryUnit(unit, fetchImpl, maxBytes) {
  const route = unit.source.application_url;
  const parsed = new URL(route);
  if (parsed.protocol !== 'https:') throw new Error(`Canary route must use HTTPS: ${route}`);

  let robotsResponse;
  try {
    robotsResponse = await fetchImpl(`${parsed.origin}/robots.txt`, { headers: { 'user-agent': 'FindPitchesBot/1.0 (+https://findpitches.com)' } });
  } catch (error) {
    return { source_id: unit.source.id, status: 'held', reason: 'robots_unavailable', detail: error?.name || 'fetch_error' };
  }
  const robotsText = robotsResponse.ok ? await robotsResponse.text() : '';
  if (robotsResponse.ok && !robotsAllows(route, parseRobots(robotsText))) {
    return { source_id: unit.source.id, status: 'held', reason: 'robots_disallowed' };
  }

  let response;
  try {
    response = await fetchImpl(route, { redirect: 'follow', headers: { 'user-agent': 'FindPitchesBot/1.0 (+https://findpitches.com)' } });
  } catch (error) {
    return { source_id: unit.source.id, status: 'held', reason: 'network_error', detail: error?.name || 'fetch_error' };
  }
  if (!response.ok) return { source_id: unit.source.id, status: 'held', reason: `http_${response.status}`, http_status: response.status };

  const finalUrl = response.url || route;
  if (normalizeHost(finalUrl) !== normalizeHost(route)) {
    return { source_id: unit.source.id, status: 'held', reason: 'redirect_outside_approved_host', final_url: finalUrl };
  }

  const html = (await response.text()).slice(0, maxBytes);
  const text = htmlToText(html);
  const signalMatch = text.match(APPLICATION_SIGNAL);
  return {
    source_id: unit.source.id,
    organisation: unit.source.organisation,
    area_code: unit.context.unit_code,
    status: signalMatch ? 'passed' : 'held',
    reason: signalMatch ? null : 'no_application_signal',
    final_url: finalUrl,
    title: extractTitle(html),
    bytes_examined: new TextEncoder().encode(html).length,
    application_signal: signalMatch?.[0]?.toLowerCase() || null,
    approval_evidence_hash: unit.source.approval_evidence_hash
  };
}

export async function executeUkCloudflareCanary(options = {}) {
  const plan = options.plan || buildUkCloudflareCanaryPlan();
  assertUkCanaryHealthGate(options.health_gate, { now: options.now, max_age_ms: options.max_age_ms });
  if (plan.country !== 'UK' || plan.status !== 'dormant' || plan.trigger_ready !== false) throw new Error('Unexpected UK canary plan state');
  if (!Array.isArray(plan.units) || plan.units.length !== 3) throw new Error('UK canary execution requires exactly three bounded units');
  for (const unit of plan.units) {
    const execution = unit.execution || {};
    if (!execution.fetch_live_page || !execution.extract_candidate || !execution.validate_candidate) throw new Error('UK canary unit is missing required read-only execution stages');
    if (execution.discovery || execution.serper_credits || execution.create_source_pr || execution.create_opportunity_pr || execution.publish || execution.mutate) {
      throw new Error('UK canary execution cannot discover, publish, create PRs or mutate data');
    }
  }

  const fetchImpl = options.fetchImpl || fetch;
  const maxBytes = Math.max(10_000, Math.min(240_000, Number(options.max_bytes || 240_000)));
  const results = [];
  for (const unit of plan.units) results.push(await fetchCanaryUnit(unit, fetchImpl, maxBytes));
  return Object.freeze({
    canary_id: plan.canary_id,
    country: 'UK',
    mode: 'read_only_direct_source_canary',
    source_count: results.length,
    passed_count: results.filter(item => item.status === 'passed').length,
    held_count: results.filter(item => item.status === 'held').length,
    serper_credits_used: 0,
    publication_attempted: false,
    mutation_attempted: false,
    results: Object.freeze(results)
  });
}
