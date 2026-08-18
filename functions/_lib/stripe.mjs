const STRIPE_API = 'https://api.stripe.com/v1';
const ACCESS_STATUSES = new Set(['active', 'trialing']);
const ACCESS_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function requireEnv(env, key) {
  const value = env[key] || '';
  if (!value) throw new Error(`${key} is not configured`);
  return value;
}

function formBody(params) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') body.append(key, String(value));
  }
  return body;
}

export function json(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers
    }
  });
}

export async function stripeRequest(env, method, path, params = {}) {
  const secret = requireEnv(env, 'STRIPE_SECRET_KEY');
  const response = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${secret}`,
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: method === 'GET' ? undefined : formBody(params)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.error?.message || `Stripe API failed with HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

export async function stripeGet(env, path, params = {}) {
  const qs = formBody(params).toString();
  return stripeRequest(env, 'GET', `${path}${qs ? `?${qs}` : ''}`);
}

export function subscriptionAllowsAccess(subscription) {
  const status = typeof subscription === 'string' ? '' : String(subscription?.status || '').toLowerCase();
  return ACCESS_STATUSES.has(status);
}

export function subscriptionHasHadAccess(record) {
  const status = String(record?.status || '').toLowerCase();
  return Boolean(
    record?.subscription ||
    record?.customer ||
    status === 'trialing' ||
    status === 'active' ||
    status === 'canceled' ||
    status === 'past_due' ||
    status === 'unpaid'
  );
}

export async function checkoutSessionAccess(env, sessionId) {
  if (!sessionId || !env.STRIPE_SECRET_KEY) return { allowed: false, reason: 'missing_session' };
  const session = await stripeGet(env, `/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    'expand[]': 'subscription'
  });
  return {
    allowed: subscriptionAllowsAccess(session.subscription),
    reason: 'stripe_checkout_session',
    session,
    customer: session.customer || session.subscription?.customer || '',
    subscription: session.subscription || null,
    email: session.customer_details?.email || session.customer_email || ''
  };
}

export function baseUrlFrom(request, env) {
  const configured = String(env.PUBLIC_BASE_URL || env.PITCHLIST_PUBLIC_BASE_URL || '').replace(/\/$/, '');
  if (configured) return configured;
  const url = new URL(request.url);
  return url.origin;
}

export function getCookie(request, name) {
  const cookie = request.headers.get('cookie') || '';
  for (const part of cookie.split(';')) {
    const [rawKey, ...rest] = part.trim().split('=');
    if (rawKey === name) return decodeURIComponent(rest.join('=') || '');
  }
  return '';
}

export function sessionCookie(sessionId) {
  return [
    `pitchlist_session_id=${encodeURIComponent(sessionId)}`,
    'Path=/',
    'Max-Age=2592000',
    'SameSite=Lax',
    'Secure',
    'HttpOnly'
  ].join('; ');
}

export function accessTokenCookie(token) {
  return [
    `pitchlist_access_token=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${ACCESS_TOKEN_MAX_AGE_SECONDS}`,
    'SameSite=Lax',
    'Secure',
    'HttpOnly'
  ].join('; ');
}

export async function putAccessRecord(env, key, value) {
  const kv = env.PITCHLIST_ACCESS_KV;
  if (!kv || typeof kv.put !== 'function' || !key) return false;
  await kv.put(key, JSON.stringify({ ...value, updated_at: new Date().toISOString() }));
  return true;
}

export async function putAccessToken(env, token, value) {
  const kv = env.PITCHLIST_ACCESS_KV;
  if (!kv || typeof kv.put !== 'function' || !token) return false;
  await kv.put(`stripe:access-token:${token}`, JSON.stringify({
    ...value,
    updated_at: new Date().toISOString()
  }), { expirationTtl: ACCESS_TOKEN_MAX_AGE_SECONDS });
  return true;
}

export async function accessRecord(env, key) {
  const kv = env.PITCHLIST_ACCESS_KV;
  if (!kv || typeof kv.get !== 'function' || !key) return null;
  const raw = await kv.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function bindingValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function resolveCanonicalBinding(env, binding) {
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)) {
    return { verified: false, reason: 'invalid_binding' };
  }

  const subscription = bindingValue(binding.subscription);
  const customer = bindingValue(binding.customer);
  const email = typeof binding.email === 'string' ? normaliseEmail(binding.email) : '';
  if (!subscription || !customer || !email) {
    return { verified: false, reason: 'incomplete_binding' };
  }

  const canonical = await accessRecord(env, `stripe:subscription:${subscription}`);
  if (!canonical || typeof canonical !== 'object' || Array.isArray(canonical)) {
    return { verified: false, reason: 'canonical_subscription_missing' };
  }

  const canonicalSubscription = bindingValue(canonical.subscription);
  const canonicalCustomer = bindingValue(canonical.customer);
  const canonicalEmail = typeof canonical.email === 'string' ? normaliseEmail(canonical.email) : '';
  if (
    canonicalSubscription !== subscription
    || canonicalCustomer !== customer
    || canonicalEmail !== email
  ) {
    return { verified: false, reason: 'canonical_binding_mismatch' };
  }

  return {
    verified: true,
    reason: 'canonical_binding_verified',
    subscription,
    customer,
    email,
    status: String(canonical.status || '').toLowerCase(),
    canonical
  };
}

export async function resolveCanonicalTokenBinding(env, token) {
  const value = bindingValue(token);
  if (!value) return { verified: false, reason: 'missing_token' };
  const record = await accessRecord(env, `stripe:access-token:${value}`);
  if (!record) return { verified: false, reason: 'token_not_found' };
  const binding = await resolveCanonicalBinding(env, record);
  return { ...binding, record };
}

export function resolveCanonicalEntitlement(binding) {
  if (!binding?.verified || !binding.canonical) {
    return { ...binding, allowed: false };
  }
  const allowed = binding.canonical.access === 'allowed'
    && subscriptionAllowsAccess(binding.canonical);
  return {
    ...binding,
    allowed,
    reason: allowed ? 'canonical_subscription_allowed' : 'canonical_subscription_blocked'
  };
}

export function emailValid(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(String(value || ''));
}

export function normaliseEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function accessToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function upsertSubscriptionAccess(env, subscription) {
  const status = String(subscription?.status || '').toLowerCase();
  const customerId = subscription?.customer || '';
  let email = '';
  if (customerId) {
    try {
      const customer = await stripeGet(env, `/customers/${encodeURIComponent(customerId)}`);
      email = normaliseEmail(customer.email || '');
    } catch {
      email = '';
    }
  }
  const payload = {
    status,
    access: subscriptionAllowsAccess(subscription) ? 'allowed' : 'blocked',
    customer: customerId,
    subscription: subscription?.id || '',
    email,
    current_period_end: subscription?.current_period_end || '',
    cancel_at_period_end: Boolean(subscription?.cancel_at_period_end)
  };
  await putAccessRecord(env, `stripe:subscription:${subscription?.id || ''}`, payload);
  await putAccessRecord(env, `stripe:customer:${customerId}`, payload);
  if (email) await putAccessRecord(env, `stripe:email:${email}`, payload);
  return payload;
}

function hex(buffer) {
  return [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyStripeWebhook(rawBody, signatureHeader, secret, toleranceSeconds = 300) {
  if (!signatureHeader || !secret) throw new Error('Missing Stripe webhook signature or secret');
  const parts = Object.fromEntries(signatureHeader.split(',').map(part => {
    const [key, value] = part.split('=');
    return [key, value];
  }));
  const timestamp = Number(parts.t || 0);
  const expected = parts.v1 || '';
  if (!timestamp || !expected) throw new Error('Malformed Stripe webhook signature');
  const age = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
  if (age > toleranceSeconds) throw new Error('Stripe webhook timestamp outside tolerance');

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signedPayload = `${timestamp}.${rawBody}`;
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  if (!timingSafeEqual(hex(digest), expected)) throw new Error('Stripe webhook signature verification failed');
}
