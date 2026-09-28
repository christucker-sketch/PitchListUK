import { createCustomerApiService } from './service.mjs';
import { authorizeCustomerRequest } from './auth.mjs';

// Parameters accepted by the contract but not yet implemented by the store. They are rejected
// explicitly rather than silently ignored, so a caller can never believe a radius or cursor was applied.
const UNSUPPORTED_SEARCH_PARAMS = Object.freeze(['lat', 'lng', 'radius_km', 'radiusKm', 'cursor']);

// Contract error prefixes → stable public error codes. Anything else is an internal error.
const CLIENT_ERRORS = Object.freeze([
  ['findpitches_customer_api_market_unknown', 'invalid_market'],
  ['findpitches_v2_geography_market_unknown', 'invalid_market'],
  ['findpitches_customer_api_coordinates', 'invalid_parameter'],
  ['findpitches_customer_api_radius', 'invalid_parameter']
]);

export async function routeCustomerApi(request, env, { now } = {}) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/v1/')) return null;
  const path = url.pathname.replace(/\/+$/, '');
  if (!isCustomerPath(path)) return null;

  const requestId = request.headers.get('cf-ray') || crypto.randomUUID();
  if (request.method !== 'GET') return json({ ok: false, error: 'method_not_allowed' }, 405, requestId, { allow: 'GET' });

  const auth = await authorizeCustomerRequest(request, env, path);
  if (!auth.ok) {
    const extra = auth.status === 401 ? { 'www-authenticate': 'Bearer' } : {};
    return json({ ok: false, error: auth.error }, auth.status, requestId, extra);
  }

  try {
    const api = createCustomerApiService(env?.FINDPITCHES_DB, { now, maxAgeDays: env?.FINDPITCHES_CUSTOMER_MAX_AGE_DAYS });

    if (path === '/v1/markets') return json(await api.markets(), 200, requestId);

    if (path === '/v1/regions') {
      const market = url.searchParams.get('market');
      if (!market || !market.trim()) return json({ ok: false, error: 'market_required' }, 400, requestId);
      return json(await api.regions(market), 200, requestId);
    }

    if (path === '/v1/opportunities/search') {
      const unsupported = UNSUPPORTED_SEARCH_PARAMS.filter(name => url.searchParams.has(name));
      if (unsupported.length) return json({ ok: false, error: 'unsupported_parameter', parameters: unsupported }, 400, requestId);
      return json(await api.search(Object.fromEntries(url.searchParams.entries())), 200, requestId);
    }

    const match = path.match(/^\/v1\/opportunities\/([^/]+)$/);
    if (match) {
      let id;
      try { id = decodeURIComponent(match[1]); } catch { return json({ ok: false, error: 'invalid_parameter' }, 400, requestId); }
      if (!id || id.length > 200) return json({ ok: false, error: 'invalid_parameter' }, 400, requestId);
      const result = await api.opportunity(id);
      return result ? json(result, 200, requestId) : json({ ok: false, error: 'opportunity_not_found' }, 404, requestId);
    }

    return null;
  } catch (error) {
    const message = String(error?.message || error);
    const client = CLIENT_ERRORS.find(([prefix]) => message.startsWith(prefix));
    if (client) return json({ ok: false, error: client[1] }, 400, requestId);
    // Internal details stay in logs only.
    console.error('findpitches_customer_api_error', JSON.stringify({ request_id: requestId, path, message }));
    return json({ ok: false, error: 'internal_error' }, 500, requestId);
  }
}

function isCustomerPath(path) {
  return path === '/v1/markets' || path === '/v1/regions' || path === '/v1/opportunities/search' || /^\/v1\/opportunities\/[^/]+$/.test(path);
}

function json(body, status = 200, requestId = null, headers = {}) {
  return Response.json(body, { status, headers: {
    'cache-control': 'no-store',
    'x-robots-tag': 'noindex, nofollow',
    'x-content-type-options': 'nosniff',
    ...(requestId ? { 'x-request-id': requestId } : {}),
    ...headers
  } });
}
