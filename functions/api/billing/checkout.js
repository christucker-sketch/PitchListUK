import {
  accessRecord,
  baseUrlFrom,
  json,
  normaliseEmail,
  stripeRequest,
  subscriptionAllowsAccess,
  subscriptionHasHadAccess
} from '../../_lib/stripe.mjs';
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
  const email = normaliseEmail(input.email || input.vendor_profile?.email || '');
  if (email) {
    const existingAccess = await accessRecord(env, `stripe:email:${email}`);
    if (subscriptionAllowsAccess(existingAccess)) {
      return json({
        error: 'existing_active_access',
        message: 'That email already has active PitchList access. Use the access link form or manage billing instead.'
      }, 409);
    }
    if (subscriptionHasHadAccess(existingAccess)) {
      return json({
        error: 'trial_already_used',
        message: 'That email has already used a PitchList trial. Restart access from the existing billing account or contact hello@pitchlist.uk.'
      }, 409);
    }
  }

  let profile = null;
  if (input.vendor_profile || input.business_name || input.category || input.specialty) {
    profile = normaliseProfileInput({
      ...(input.vendor_profile || {}),
      email,
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
    success_url: `${baseUrl}/find-pitches?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/find-pitches?checkout=cancelled`,
    payment_method_collection: 'always',
    'subscription_data[trial_period_days]': env.STRIPE_TRIAL_DAYS || 7,
    'subscription_data[metadata][product]': 'pitchlist_database',
    'subscription_data[metadata][vendor_id]': profile?.vendor_id || '',
    'metadata[product]': 'pitchlist_database',
    'metadata[vendor_id]': profile?.vendor_id || '',
    client_reference_id: profile?.vendor_id || '',
    allow_promotion_codes: 'true'
  };

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
