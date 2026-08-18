import { json } from './stripe.mjs';

const EVENT_PREFIX = 'analytics:event:';
const MAX_DETAIL = 120;
const MAX_EVENTS_PER_DAY = 1000;
const ATTRIBUTION_KEYS = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']);
const CLICK_ID_KEYS = new Set(['gclid', 'fbclid']);
const ATTRIBUTION_ALIASES = new Map([
  ['utm_source', 'source'],
  ['utm_medium', 'medium'],
  ['utm_campaign', 'campaign'],
  ['utm_term', 'term'],
  ['utm_content', 'content']
]);
const ANALYTICS_SESSION_V2 = /^as_[a-f0-9]{32}$/;
const ANALYTICS_SESSION_LEGACY = /^[a-f0-9]{24}$/;
const ANALYTICS_SESSION_STORED = /^aj_[a-f0-9]{64}$/;
const ANALYTICS_SESSION_DOMAIN = 'pitchlist.analytics-session.v2';
const MAX_PROPERTY_DEPTH = 5;
const MAX_PROPERTY_KEYS = 80;

function clean(value, max = MAX_DETAIL) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function decoded(value) {
  let output = String(value || '');
  for (let i = 0; i < 4; i += 1) {
    try {
      const next = decodeURIComponent(output.replace(/\+/g, ' '));
      if (next === output) break;
      output = next;
    } catch {
      break;
    }
  }
  return output;
}

function keyFingerprint(value) {
  return decoded(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function sensitiveKey(value) {
  const key = keyFingerprint(value);
  return key === 'token'
    || key === 'session'
    || key === 'checkout'
    || key.endsWith('token')
    || key.startsWith('session')
    || key.endsWith('session')
    || key.includes('accesstoken')
    || key.includes('sessionid')
    || key.includes('sessionidentifier')
    || key.includes('stripesession')
    || key.includes('checkoutsession')
    || key.includes('checkoutid')
    || key.includes('checkoutidentifier');
}

function sensitiveFragment(value) {
  const text = decoded(value).toLowerCase();
  return /(?:access[\s_-]*token|session[\s_-]*(?:id|identifier)|checkout[\s_-]*(?:session|id)|(?:^|[?&#;\s])(?:token|session|checkout)\s*[=:])/.test(text)
    || /\b(?:cs_(?:test|live)|sess_|cus_|sub_)[a-z0-9_-]+\b/.test(text)
    || /\bas_[a-f0-9]{32}\b/.test(text)
    || /^(?:[a-f0-9]{24}|[a-f0-9]{64})$/.test(text.trim());
}

function malformedEncoding(value) {
  return /%(?![0-9a-f]{2})/i.test(String(value || ''));
}

function safeScalar(value, max = MAX_DETAIL) {
  const output = clean(value, max);
  return sensitiveFragment(output) ? '' : output;
}

function clickIdPresence(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  return undefined;
}

function parsedUrl(value, origin = 'https://pitchlist.uk') {
  const raw = String(value || '').trim();
  if (!raw || malformedEncoding(raw)) return null;
  try {
    return new URL(raw, origin);
  } catch {
    return null;
  }
}

function safePath(value, origin = 'https://pitchlist.uk') {
  const url = parsedUrl(value, origin);
  if (!url || sensitiveFragment(url.pathname)) return '/';
  const pathname = clean(url.pathname, 220);
  return pathname.startsWith('/') ? pathname : '/';
}

function safeReferrer(value) {
  const url = parsedUrl(value);
  if (!url || !['http:', 'https:'].includes(url.protocol) || sensitiveFragment(url.pathname)) return '';
  return clean(`${url.origin}${url.pathname}`, 220);
}

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function randomId(bytes = 8) {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return [...array].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256(secret, value) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(`${ANALYTICS_SESSION_DOMAIN}|${value}`));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function analyticsSessionSecret(env) {
  const secret = env.PITCHLIST_ANALYTICS_SALT || '';
  return typeof secret === 'string' && secret.trim() ? secret : '';
}

function incomingAnalyticsSession(input) {
  if (typeof input.analytics_session_id === 'string' && ANALYTICS_SESSION_V2.test(input.analytics_session_id)) {
    return input.analytics_session_id;
  }
  if (typeof input.session_id === 'string' && ANALYTICS_SESSION_LEGACY.test(input.session_id)) {
    return input.session_id;
  }
  return '';
}

async function pseudonymousAnalyticsSession(input, env) {
  const raw = incomingAnalyticsSession(input);
  const secret = analyticsSessionSecret(env);
  if (!raw || !secret) return '';
  return `aj_${await hmacSha256(secret, raw)}`;
}

export function analyticsKv(env) {
  return env.PITCHLIST_ANALYTICS_KV || env.PITCHLIST_ACCESS_KV || null;
}

export function analyticsAuth(request, env) {
  const url = new URL(request.url);
  const configured = clean(env.PITCHLIST_ANALYTICS_TOKEN || env.PITCHLIST_DATABASE_ACCESS_CODE || '', 240);
  if (!configured) return { ok: false, status: 503, error: 'analytics_auth_not_configured' };
  const provided = clean(
    url.searchParams.get('token')
    || request.headers.get('x-pitchlist-analytics-token')
    || request.headers.get('x-pitchlist-access')
    || '',
    240
  );
  if (provided !== configured) return { ok: false, status: 401, error: 'analytics_unauthorised' };
  return { ok: true };
}

export function analyticsError(error, status = 400) {
  return json({ ok: false, error }, status);
}

function referrerHost(value) {
  const safe = safeReferrer(value);
  if (!safe) return '';
  try {
    return new URL(safe).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function campaignFrom(url, payload) {
  const values = {};
  const clickPresence = { gclid: false, fbclid: false };
  if (url) {
    for (const [rawKey, rawValue] of url.searchParams.entries()) {
      const key = decoded(rawKey).toLowerCase();
      if (CLICK_ID_KEYS.has(key)) {
        if (String(rawValue).trim()) clickPresence[key] = true;
        continue;
      }
      if (ATTRIBUTION_KEYS.has(key) && !Object.hasOwn(values, key)) {
        const value = safeScalar(rawValue, 160);
        if (value) values[key] = value;
      }
    }
  }
  for (const key of ATTRIBUTION_KEYS) {
    if (Object.hasOwn(values, key)) continue;
    const alias = ATTRIBUTION_ALIASES.get(key);
    const candidate = payload[key] ?? (alias ? payload[alias] : undefined);
    if (!['string', 'number'].includes(typeof candidate)) continue;
    const value = safeScalar(candidate, 160);
    if (value) values[key] = value;
  }
  for (const key of CLICK_ID_KEYS) {
    if (clickPresence[key]) continue;
    const presence = clickIdPresence(payload[key]);
    if (presence !== undefined) clickPresence[key] = presence;
  }
  return {
    source: clean(values.utm_source || '', 80),
    medium: clean(values.utm_medium || '', 80),
    campaign: clean(values.utm_campaign || '', 100),
    content: clean(values.utm_content || '', 100),
    term: clean(values.utm_term || '', 100),
    fbclid: clickPresence.fbclid,
    gclid: clickPresence.gclid
  };
}

function normaliseEventName(value) {
  if (sensitiveFragment(value)) return 'event';
  const name = clean(value, 80).toLowerCase().replace(/[^a-z0-9_:-]+/g, '_').replace(/^_+|_+$/g, '');
  return name || 'event';
}

export async function normaliseAnalyticsEvent(context, input = {}) {
  const { request, env } = context;
  const requestUrl = new URL(request.url);
  const targetInput = input.path || input.url || input.href || requestUrl.pathname;
  const targetUrl = parsedUrl(targetInput, requestUrl.origin);
  const rawReferrer = input.referrer || request.headers.get('referer') || '';
  const now = new Date();
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '';
  const ua = request.headers.get('user-agent') || '';
  const hashSalt = env.PITCHLIST_ANALYTICS_SALT || env.PITCHLIST_WEBHOOK_SECRET || env.STRIPE_WEBHOOK_SECRET || 'pitchlist-analytics-v1';
  const visitor = await sha256(`${hashSalt}|${ip}|${ua}`).then(hash => hash.slice(0, 24));
  const analyticsSession = await pseudonymousAnalyticsSession(input, env);

  const event = {
    id: randomId(8),
    schema: 'pitchlist_analytics_event_v1',
    ts: now.toISOString(),
    day: dayKey(now),
    event: normaliseEventName(input.event || input.type),
    path: safePath(targetInput, requestUrl.origin),
    page: safeScalar(input.page || input.title || '', 120),
    referrer: safeReferrer(rawReferrer),
    referrer_host: referrerHost(rawReferrer),
    visitor,
    campaign: campaignFrom(targetUrl, input),
    properties: cleanProperties(input.properties || input.props || {}),
    cf: {
      country: clean(request.cf?.country || '', 20),
      colo: clean(request.cf?.colo || '', 20),
      bot_score: Number.isFinite(Number(request.cf?.botManagement?.score)) ? Number(request.cf.botManagement.score) : null
    }
  };
  if (analyticsSession) event.analytics_session_id = analyticsSession;
  return event;
}

function cleanProperties(properties, depth = 0) {
  if (!properties || typeof properties !== 'object' || Array.isArray(properties) || depth > MAX_PROPERTY_DEPTH) return {};
  const output = {};
  for (const [key, value] of Object.entries(properties).slice(0, MAX_PROPERTY_KEYS)) {
    const safeKey = clean(decoded(key), 50).toLowerCase().replace(/[^a-z0-9_:-]+/g, '_');
    const fingerprint = keyFingerprint(key);
    if (!safeKey || sensitiveKey(key) || ['query', 'search', 'searchparams'].includes(fingerprint)) continue;
    if (CLICK_ID_KEYS.has(fingerprint)) {
      const presence = clickIdPresence(value);
      if (presence !== undefined) output[safeKey] = presence;
      continue;
    }
    if (Array.isArray(value)) {
      const items = value.map(item => cleanPropertyValue(item, safeKey, depth + 1)).filter(item => item !== undefined && item !== '').slice(0, 20);
      if (items.length) output[safeKey] = items;
      continue;
    }
    const cleaned = cleanPropertyValue(value, safeKey, depth + 1);
    if (cleaned !== undefined && cleaned !== '') output[safeKey] = cleaned;
  }
  return output;
}

function cleanPropertyValue(value, key, depth) {
  if (depth > MAX_PROPERTY_DEPTH) return undefined;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value && typeof value === 'object') return cleanProperties(value, depth);
  if (['url', 'href', 'path'].includes(key)) return safePath(value);
  if (key === 'referrer') return safeReferrer(value);
  const output = safeScalar(value, 160);
  return output || undefined;
}

export async function recordAnalyticsEvent(context, input = {}) {
  const kv = analyticsKv(context.env);
  if (!kv || typeof kv.put !== 'function') return { stored: false };
  const event = await normaliseAnalyticsEvent(context, input);
  const key = `${EVENT_PREFIX}${event.day}:${event.ts}:${event.id}`;
  await kv.put(key, JSON.stringify(event), { expirationTtl: 60 * 60 * 24 * 45 });
  return { stored: true, key, event };
}

export function waitForAnalytics(context, input) {
  const promise = recordAnalyticsEvent(context, input).catch(() => null);
  if (context.waitUntil) context.waitUntil(promise);
  return promise;
}

export async function listAnalyticsEvents(env, days = 7) {
  const kv = analyticsKv(env);
  if (!kv || typeof kv.list !== 'function' || typeof kv.get !== 'function') return { stored: false, events: [] };
  const now = new Date();
  const events = [];
  for (let i = 0; i < Math.min(Math.max(days, 1), 45); i += 1) {
    const date = new Date(now);
    date.setUTCDate(now.getUTCDate() - i);
    const prefix = `${EVENT_PREFIX}${dayKey(date)}:`;
    let cursor;
    let seen = 0;
    do {
      const page = await kv.list({ prefix, cursor, limit: Math.min(1000, MAX_EVENTS_PER_DAY - seen) });
      cursor = page.cursor;
      for (const item of page.keys || []) {
        const raw = await kv.get(item.name);
        if (!raw) continue;
        try {
          events.push(JSON.parse(raw));
          seen += 1;
        } catch {
          // Ignore malformed analytics rows.
        }
      }
    } while (cursor && seen < MAX_EVENTS_PER_DAY);
  }
  return { stored: true, events };
}

export function summariseAnalytics(events = []) {
  const sorted = [...events].sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
  const visitors = new Set();
  const sessions = new Set();
  const summary = {
    generated_at: new Date().toISOString(),
    totals: {
      events: sorted.length,
      visitors: 0,
      sessions: 0,
      page_views: 0,
      database_searches: 0,
      checkout_starts: 0,
      checkout_returns: 0,
      link_clicks: 0
    },
    by_day: {},
    by_event: {},
    top_paths: {},
    campaigns: {},
    referrers: {},
    searches: [],
    recent: sorted.slice(0, 80)
  };

  for (const event of sorted) {
    if (event.visitor) visitors.add(event.visitor);
    const session = analyticsSessionAccessor(event);
    if (session) sessions.add(session);
    const day = event.day || String(event.ts || '').slice(0, 10) || 'unknown';
    const name = event.event || 'event';
    summary.by_day[day] = (summary.by_day[day] || 0) + 1;
    summary.by_event[name] = (summary.by_event[name] || 0) + 1;
    summary.top_paths[event.path || '/'] = (summary.top_paths[event.path || '/'] || 0) + 1;
    if (event.referrer_host) summary.referrers[event.referrer_host] = (summary.referrers[event.referrer_host] || 0) + 1;
    const campaign = [event.campaign?.source, event.campaign?.medium, event.campaign?.campaign].filter(Boolean).join(' / ');
    if (campaign) summary.campaigns[campaign] = (summary.campaigns[campaign] || 0) + 1;
    if (name === 'page_view') summary.totals.page_views += 1;
    if (name === 'database_search') {
      summary.totals.database_searches += 1;
      summary.searches.push({
        ts: event.ts,
        postcode: event.properties?.postcode || '',
        radius: event.properties?.radius || '',
        category: event.properties?.category || '',
        q: event.properties?.q || '',
        access: event.properties?.access || '',
        count: event.properties?.count ?? '',
        returned: event.properties?.returned ?? ''
      });
    }
    if (name === 'checkout_start') summary.totals.checkout_starts += 1;
    if (name === 'checkout_return') summary.totals.checkout_returns += 1;
    if (name === 'link_click') summary.totals.link_clicks += 1;
  }
  summary.totals.visitors = visitors.size;
  summary.totals.sessions = sessions.size;
  summary.searches = summary.searches.slice(0, 60);
  summary.top_paths = topEntries(summary.top_paths, 20);
  summary.referrers = topEntries(summary.referrers, 20);
  summary.campaigns = topEntries(summary.campaigns, 20);
  summary.by_event = topEntries(summary.by_event, 30);
  return summary;
}

function analyticsSessionAccessor(event) {
  if (typeof event?.analytics_session_id === 'string' && ANALYTICS_SESSION_STORED.test(event.analytics_session_id)) {
    return event.analytics_session_id;
  }
  if (typeof event?.session_id === 'string' && ANALYTICS_SESSION_LEGACY.test(event.session_id)) {
    return `legacy:${event.session_id}`;
  }
  return '';
}

function topEntries(map, limit) {
  return Object.fromEntries(Object.entries(map).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit));
}
