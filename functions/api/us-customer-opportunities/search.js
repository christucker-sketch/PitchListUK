import { usOpportunitySnapshot } from '../../_data/us-opportunities.mjs';
import { accessTokenCookie, checkoutSessionAccess, getCookie, json as stripeJson, resolveCanonicalEntitlement, resolveCanonicalTokenBinding, sessionCookie } from '../../_lib/stripe.mjs';
import usSearch from '../../../operations/opportunity-pipeline/lib/us-customer-search.js';

const { searchUsCustomerRows } = usSearch;

function json(payload, status = 200, headers = {}) {
  return stripeJson(payload, status, headers);
}

export async function resolveUsAccess(request, env, url) {
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
      // Fall through to access-token checks.
    }
  }

  const token = String(
    url.searchParams.get('access_token')
    || request.headers.get('x-pitchlist-access-token')
    || getCookie(request, 'pitchlist_access_token')
    || ''
  ).trim();
  if (token) {
    const entitlement = resolveCanonicalEntitlement(await resolveCanonicalTokenBinding(env, token));
    if (entitlement.allowed) {
      return {
        mode: 'subscriber',
        reason: 'stripe_access_token',
        email: entitlement.email,
        customer: entitlement.customer,
        set_cookie: accessTokenCookie(token)
      };
    }
    return { mode: 'preview', reason: 'stripe_access_token_invalid' };
  }

  return { mode: 'preview', reason: 'not_subscribed' };
}

export function parseUsSearchOptions(url, fullAccess = false) {
  return {
    fullAccess,
    q: url.searchParams.get('q') || '',
    category: url.searchParams.get('category') || '',
    zip: url.searchParams.get('zip') || url.searchParams.get('postal_code') || '',
    radius_miles: url.searchParams.get('radius_miles') || url.searchParams.get('radius') || 0,
    limit: url.searchParams.get('limit') || 75,
    offset: url.searchParams.get('offset') || 0
  };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const access = await resolveUsAccess(request, env, url);
  const result = searchUsCustomerRows(
    usOpportunitySnapshot.rows,
    parseUsSearchOptions(url, access.mode === 'subscriber')
  );

  const headers = {};
  if (access.set_cookie) headers['set-cookie'] = access.set_cookie;

  return json({
    ...result,
    access_mode: access.mode,
    access_reason: access.reason,
    market_domain: 'findpitches.com',
    currency: 'USD'
  }, 200, headers);
}
