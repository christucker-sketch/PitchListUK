import {
  accessRecord,
  accessToken,
  accessTokenCookie,
  emailValid,
  json,
  normaliseEmail,
  putAccessToken,
  resolveCanonicalBinding,
  resolveCanonicalEntitlement,
  resolveCanonicalTokenBinding
} from '../../_lib/stripe.mjs';
import { vendorSearchDefaults } from '../../_lib/vendor-profiles.mjs';
import { accessLinkEmail, EmailDeliveryError, sendTransactionalEmail } from '../../_lib/email.mjs';

function accessUrl(request, token) {
  const url = new URL(request.url);
  return `${url.origin}/find-pitches?access_token=${encodeURIComponent(token)}`;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let input = {};
  try {
    input = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const email = normaliseEmail(input.email);
  if (!emailValid(email)) return json({ error: 'invalid_email' }, 400);

  const record = await accessRecord(env, `stripe:email:${email}`);
  const entitlement = resolveCanonicalEntitlement(await resolveCanonicalBinding(env, record));
  if (!entitlement.allowed) {
    return json({
      ok: true,
      sent: false,
      message: 'If that email has active PitchList access, an unlock link will be sent.'
    });
  }

  const token = accessToken();
  await putAccessToken(env, token, {
    ...record,
    email,
    access_source: 'email_access_link'
  });
  const link = accessUrl(request, token);
  let delivery;
  try {
    delivery = await sendTransactionalEmail(env, accessLinkEmail(link), {
      to: email,
      logger: context.logger || console
    });
  } catch (error) {
    const status = error instanceof EmailDeliveryError ? error.status : 502;
    return json({
      error: 'email_delivery_unavailable',
      message: 'Email delivery is temporarily unavailable. Please try again shortly.'
    }, status);
  }

  return json({
    ok: true,
    sent: true,
    delivery: delivery.provider,
    message: 'Access link sent.'
  });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = String(url.searchParams.get('token') || '').trim();
  if (!token) return json({ error: 'missing_token' }, 400);

  const entitlement = resolveCanonicalEntitlement(await resolveCanonicalTokenBinding(env, token));
  if (!entitlement.allowed) return json({ error: 'invalid_or_expired_token' }, 404);
  const searchDefaults = await vendorSearchDefaults(env, entitlement.email);

  return json({
    ok: true,
    access: 'subscriber',
    email: entitlement.email,
    customer: entitlement.customer,
    subscription_status: entitlement.status,
    search_defaults: searchDefaults
  }, 200, {
    'set-cookie': accessTokenCookie(token)
  });
}
