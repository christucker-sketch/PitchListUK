import { json } from './stripe.mjs';

const EVENT_PREFIX = 'analytics:event:';
const MAX_DETAIL = 120;
const MAX_EVENTS_PER_DAY = 1000;

function clean(value, max = MAX_DETAIL) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function safePath(value) {
  try {
    const url = new URL(value, 'https://pitchlist.uk');
    return `${url.pathname}${url.search ? url.search.slice(0, 180) : ''}`;
  } catch {
    return clean(value, 220) || '/';
  }
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
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function campaignFrom(url, payload) {
  return {
    source: clean(url.searchParams.get('utm_source') || payload.source || '', 80),
    medium: clean(url.searchParams.get('utm_medium') || payload.medium || '', 80),
    campaign: clean(url.searchParams.get('utm_campaign') || payload.campaign || '', 100),
    content: clean(url.searchParams.get('utm_content') || payload.content || '', 100),
    term: clean(url.searchParams.get('utm_term') || payload.term || '', 100),
    fbclid: url.searchParams.has('fbclid'),
    gclid: url.searchParams.has('gclid')
  };
}

function normaliseEventName(value) {
  const name = clean(value, 80).toLowerCase().replace(/[^a-z0-9_:-]+/g, '_').replace(/^_+|_+$/g, '');
  return name || 'event';
}

export async function normaliseAnalyticsEvent(context, input = {}) {
  const { request, env } = context;
  const requestUrl = new URL(request.url);
  const targetUrl = new URL(input.url || input.href || request.url, requestUrl.origin);
  const now = new Date();
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '';
  const ua = request.headers.get('user-agent') || '';
  const hashSalt = env.PITCHLIST_ANALYTICS_SALT || env.PITCHLIST_WEBHOOK_SECRET || env.STRIPE_WEBHOOK_SECRET || 'pitchlist-analytics-v1';
  const visitor = await sha256(`${hashSalt}|${ip}|${ua}`).then(hash => hash.slice(0, 24));

  return {
    id: randomId(8),
    schema: 'pitchlist_analytics_event_v1',
    ts: now.toISOString(),
    day: dayKey(now),
    event: normaliseEventName(input.event || input.type),
    path: safePath(targetUrl.href),
    page: clean(input.page || input.title || '', 120),
    referrer: clean(input.referrer || request.headers.get('referer') || '', 220),
    referrer_host: referrerHost(input.referrer || request.headers.get('referer') || ''),
    visitor,
    session_id: clean(input.session_id || input.session || '', 80),
    campaign: campaignFrom(targetUrl, input),
    properties: cleanProperties(input.properties || input.props || {}),
    cf: {
      country: clean(request.cf?.country || '', 20),
      colo: clean(request.cf?.colo || '', 20),
      bot_score: Number.isFinite(Number(request.cf?.botManagement?.score)) ? Number(request.cf.botManagement.score) : null
    }
  };
}

function cleanProperties(properties) {
  const output = {};
  for (const [key, value] of Object.entries(properties || {})) {
    const safeKey = clean(key, 50).toLowerCase().replace(/[^a-z0-9_:-]+/g, '_');
    if (!safeKey) continue;
    if (Array.isArray(value)) output[safeKey] = value.map(item => clean(item, 80)).filter(Boolean).slice(0, 20);
    else if (typeof value === 'number' || typeof value === 'boolean') output[safeKey] = value;
    else output[safeKey] = clean(value, 160);
  }
  return output;
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
    if (event.session_id) sessions.add(event.session_id);
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

function topEntries(map, limit) {
  return Object.fromEntries(Object.entries(map).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit));
}
