import { baseUrlFrom, json, stripeRequest } from '../../_lib/stripe.mjs';
import { assertProfileInput, normaliseProfileInput, saveVendorProfile } from '../../_lib/vendor-profiles.mjs';

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_PRICE_ID) {
    return json({
      error: 'stripe_not_configured',
      message: 'Stripe checkout is not configured yet.'
    }, 503);
  }

  let input = {};
  try {
    input = await request.json();
  } catch {
    input = {};
  }

  const baseUrl = baseUrlFrom(request, env);
  let profile = null;
  if (input.vendor_profile || input.business_name || input.category || input.specialty) {
    profile = normaliseProfileInput({
      ...(input.vendor_profile || {}),
      email: input.email || input.vendor_profile?.email,
      signup_source: 'stripe_checkout_seed'
    });
    const profileError = assertProfileInput(profile);
    if (profileError) return json({ error: 'vendor_profile_invalid', message: profileError }, 400);
    await saveVendorProfile(env, profile);
  }

  const params = {
    mode: 'subscription',
    'line_items[0][price]': env.STRIPE_PRICE_ID,
    'line_items[0][quantity]': 1,
    success_url: `${baseUrl}/database?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/database?checkout=cancelled`,
    payment_method_collection: 'always',
    'subscription_data[trial_period_days]': env.STRIPE_TRIAL_DAYS || 7,
    'subscription_data[metadata][product]': 'pitchlist_database',
    'subscription_data[metadata][vendor_id]': profile?.vendor_id || '',
    'metadata[product]': 'pitchlist_database',
    'metadata[vendor_id]': profile?.vendor_id || '',
    client_reference_id: profile?.vendor_id || '',
    allow_promotion_codes: 'true'
  };

  const email = String(input.email || '').trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email)) params.customer_email = email;

  try {
    const session = await stripeRequest(env, 'POST', '/checkout/sessions', params);
    return json({ ok: true, url: session.url, id: session.id, vendor_id: profile?.vendor_id || '' });
  } catch (error) {
    return json({
      error: 'stripe_checkout_failed',
      message: error?.message || 'Stripe checkout could not be created.'
    }, 502);
  }
}
