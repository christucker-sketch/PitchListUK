import { opportunitySnapshot } from '../../_data/opportunities.mjs';
import { accessRecord, accessTokenCookie, checkoutSessionAccess, getCookie, json as stripeJson, sessionCookie } from '../../_lib/stripe.mjs';

function json(payload, status = 200, headers = {}) {
  return stripeJson(payload, status, headers);
}

async function accessContext(request, env, url) {
  if (['1', 'true', 'yes'].includes(String(env.PITCHLIST_DATABASE_PUBLIC_FULL_ACCESS || '').toLowerCase())) {
    return { mode: 'subscriber', reason: 'public_full_access' };
  }

  const required = env.PITCHLIST_DATABASE_ACCESS_CODE || '';
  if (required && url.searchParams.get('access') === required) return { mode: 'subscriber', reason: 'access_code' };
  if (required && request.headers.get('x-pitchlist-access') === required) return { mode: 'subscriber', reason: 'access_code' };
  const cookie = request.headers.get('cookie') || '';
  if (required && cookie.split(';').map(value => value.trim()).includes(`pitchlist_database_access=${required}`)) {
    return { mode: 'subscriber', reason: 'access_code' };
  }

  const sessionId = String(
    url.searchParams.get('session_id')
    || request.headers.get('x-pitchlist-session')
    || getCookie(request, 'pitchlist_session_id')
    || ''
  ).trim();
  if (sessionId) {
    try {
      const access = await checkoutSessionAccess(env, sessionId);
      if (access.allowed) {
        return {
          mode: 'subscriber',
          reason: 'stripe_session',
          session_id: sessionId,
          email: access.email,
          set_cookie: sessionCookie(sessionId)
        };
      }
    } catch {
      // Fall through to access-token checks; a stale checkout cookie should not block a valid email unlock.
    }
  }

  const token = String(
    url.searchParams.get('access_token')
    || request.headers.get('x-pitchlist-access-token')
    || getCookie(request, 'pitchlist_access_token')
    || ''
  ).trim();
  if (token) {
    const record = await accessRecord(env, `stripe:access-token:${token}`);
    if (record?.access === 'allowed') {
      return {
        mode: 'subscriber',
        reason: 'stripe_access_token',
        email: record.email || '',
        customer: record.customer || '',
        set_cookie: accessTokenCookie(token)
      };
    }
    return { mode: 'preview', reason: 'stripe_access_token_invalid' };
  }

  return { mode: 'preview', reason: 'not_subscribed' };
}

function normalisePostcode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function outcodeFrom(value) {
  const compact = normalisePostcode(value);
  if (!compact) return '';
  if (/^\w+\d[A-Z]{2}$/.test(compact) && compact.length > 3) return compact.slice(0, -3);
  const match = compact.match(/^([A-Z]{1,2}\d[A-Z\d]?)/);
  return match ? match[1] : compact;
}

function haversineMiles(a, b) {
  if (!a || !b) return null;
  const lat1 = Number(a.latitude);
  const lon1 = Number(a.longitude);
  const lat2 = Number(b.latitude);
  const lon2 = Number(b.longitude);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
  const toRad = deg => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const s1 = Math.sin(dLat / 2) ** 2;
  const s2 = Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 3958.7613 * 2 * Math.atan2(Math.sqrt(s1 + s2), Math.sqrt(1 - s1 - s2));
}

async function resolveOrigin(value) {
  const postcode = normalisePostcode(value);
  if (!postcode) return null;
  const outcode = outcodeFrom(postcode);
  const urls = postcode.length > outcode.length
    ? [`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`, `https://api.postcodes.io/outcodes/${encodeURIComponent(outcode)}`]
    : [`https://api.postcodes.io/outcodes/${encodeURIComponent(outcode)}`];
  for (const url of urls) {
    const response = await fetch(url);
    if (!response.ok) continue;
    const body = await response.json();
    const result = body.result || {};
    if (Number.isFinite(Number(result.latitude)) && Number.isFinite(Number(result.longitude))) {
      return { latitude: Number(result.latitude), longitude: Number(result.longitude), outcode };
    }
  }
  throw new Error(`Could not resolve postcode/outcode: ${value}`);
}

function splitTerms(value) {
  return String(value || '').toLowerCase().split(/[,\s]+/).map(v => v.trim()).filter(Boolean);
}

function searchable(row) {
  return [
    row.event_name,
    row.organiser,
    row.location,
    row.county,
    row.region,
    row.route_type,
    row.organiser_type,
    row.buyer_fit_tags,
    row.quality_status,
    row.vendor_categories,
    row.notes
  ].join(' ').toLowerCase();
}

function sourceHost(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function previewRow(row) {
  return {
    ...row,
    locked: true,
    source_host: sourceHost(row.source_url),
    application_url: '',
    source_url: '',
    notes: row.notes ? 'Full source and application route unlock after trial signup.' : ''
  };
}

function statusSummary(rows) {
  return rows.reduce((summary, row) => {
    const key = String(row.freshness_status || 'unknown').toLowerCase() || 'unknown';
    summary[key] = (summary[key] || 0) + 1;
    return summary;
  }, {});
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const access = await accessContext(request, env, url);
  const fullAccess = access.mode === 'subscriber';

  const postcode = url.searchParams.get('postcode') || url.searchParams.get('outcode') || '';
  const radius = Number(url.searchParams.get('radius_miles') || url.searchParams.get('radius') || 0);
  const categoryTerms = splitTerms(url.searchParams.get('category'));
  const queryTerms = splitTerms(url.searchParams.get('q'));
  const confidence = String(url.searchParams.get('confidence') || '').trim().toLowerCase();
  const requestedLimit = Math.min(Math.max(Number(url.searchParams.get('limit') || 75), 1), 250);
  const previewLimit = 24;
  const limit = fullAccess ? requestedLimit : Math.min(requestedLimit, previewLimit);

  let origin = null;
  if (postcode) {
    try {
      origin = await resolveOrigin(postcode);
    } catch (err) {
      return json({ error: 'postcode_not_found', message: err.message }, 400);
    }
  }

  const rows = opportunitySnapshot.rows.map(row => {
    const coords = Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude))
      ? { latitude: Number(row.latitude), longitude: Number(row.longitude) }
      : null;
    const distance = origin && coords ? haversineMiles(origin, coords) : null;
    return {
      ...row,
      distance_miles: distance === null ? null : Math.round(distance * 10) / 10,
      _search: searchable(row)
    };
  }).filter(row => {
    if (confidence && String(row.confidence || '').toLowerCase() !== confidence) return false;
    if (categoryTerms.length && !categoryTerms.every(term => row._search.includes(term))) return false;
    if (queryTerms.length && !queryTerms.every(term => row._search.includes(term))) return false;
    if (origin && radius > 0 && (
      row.distance_miles === null ||
      row.distance_miles > radius ||
      !['exact', 'place'].includes(row.coordinate_precision)
    )) return false;
    return true;
  }).sort((a, b) => {
    const confidenceRank = { high: 0, medium: 1, low: 2 };
    if (origin && a.distance_miles !== b.distance_miles) {
      if (a.distance_miles === null) return 1;
      if (b.distance_miles === null) return -1;
      return a.distance_miles - b.distance_miles;
    }
    return (confidenceRank[String(a.confidence || '').toLowerCase()] ?? 9) - (confidenceRank[String(b.confidence || '').toLowerCase()] ?? 9)
      || String(a.event_start || '9999').localeCompare(String(b.event_start || '9999'))
      || String(a.event_name || '').localeCompare(String(b.event_name || ''));
  });

  return json({
    updated: opportunitySnapshot.exported_at,
    source: opportunitySnapshot.source,
    access: fullAccess ? 'subscriber' : 'preview',
    access_reason: access.reason,
    account_email: fullAccess ? (access.email || '') : '',
    preview_limit: fullAccess ? null : previewLimit,
    locked_fields: fullAccess ? [] : ['application_url', 'source_url'],
    total: opportunitySnapshot.total,
    count: rows.length,
    returned: Math.min(rows.length, limit),
    status_summary: statusSummary(rows),
    postcode_distance_ready: Boolean(origin),
    rows: rows.slice(0, limit).map(({ _search, ...row }) => fullAccess ? row : previewRow(row))
  }, 200, access.set_cookie ? { 'set-cookie': access.set_cookie } : {});
}
