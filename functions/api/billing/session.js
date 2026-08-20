import { checkoutSessionAccess, json, sessionCookie } from '../../_lib/stripe.mjs';
import { vendorSearchDefaults } from '../../_lib/vendor-profiles.mjs';

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const sessionId = String(url.searchParams.get('session_id') || '').trim();
  if (!sessionId) return json({ error: 'missing_session_id' }, 400);

  const access = await checkoutSessionAccess(env, sessionId);
  if (!access.allowed) {
    return json({
      ok: false,
      access: 'blocked',
      status: access.subscription?.status || 'unknown'
    }, 402);
  }

  const searchDefaults = await vendorSearchDefaults(env, access.email);

  return json({
    ok: true,
    access: 'subscriber',
    email: access.email,
    customer: access.customer,
    subscription_status: access.subscription?.status || '',
    search_defaults: searchDefaults
  }, 200, {
    'set-cookie': sessionCookie(sessionId)
  });
}
