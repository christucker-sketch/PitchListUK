import { accessRecord, baseUrlFrom, checkoutSessionAccess, getCookie, json, stripeRequest } from '../../_lib/stripe.mjs';

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.STRIPE_SECRET_KEY) {
    return json({
      error: 'stripe_not_configured',
      message: 'Stripe billing portal is not configured yet.'
    }, 503);
  }

  let input = {};
  try {
    input = await request.json();
  } catch {
    input = {};
  }

  const sessionId = String(input.session_id || getCookie(request, 'pitchlist_session_id') || '').trim();
  const token = String(input.access_token || getCookie(request, 'pitchlist_access_token') || '').trim();
  if (!sessionId && !token) return json({ error: 'missing_access' }, 400);

  let access = {};
  if (sessionId) {
    try {
      access = await checkoutSessionAccess(env, sessionId);
    } catch {
      access = {};
    }
  }
  if (!access.customer && token) access = await accessRecord(env, `stripe:access-token:${token}`) || {};
  if (!access.customer) return json({ error: 'customer_not_found' }, 404);

  const baseUrl = baseUrlFrom(request, env);
  const portal = await stripeRequest(env, 'POST', '/billing_portal/sessions', {
    customer: access.customer,
    return_url: `${baseUrl}/find-pitches`
  });
  return json({ ok: true, url: portal.url });
}
