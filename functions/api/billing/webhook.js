import {
  accessRecord,
  accessToken,
  baseUrlFrom,
  json,
  putAccessRecord,
  putAccessToken,
  stripeGet,
  subscriptionAllowsAccess,
  upsertSubscriptionAccess,
  verifyStripeWebhook
} from '../../_lib/stripe.mjs';
import { updateVendorBilling } from '../../_lib/vendor-profiles.mjs';
import { sendTransactionalEmail, welcomeEmail } from '../../_lib/email.mjs';

function welcomeUrl(request, env, token) {
  return `${baseUrlFrom(request, env)}/find-pitches?access_token=${encodeURIComponent(token)}`;
}

async function sendWelcome(context, session, access) {
  const { env, request } = context;
  if (!session?.id || !subscriptionAllowsAccess(access) || !access.email) return { sent: false, reason: 'not_eligible' };
  const markerKey = `email:welcome:${session.id}`;
  const existing = await accessRecord(env, markerKey);
  if (existing?.status === 'sent') return { sent: false, reason: 'already_sent' };

  const token = accessToken();
  await putAccessToken(env, token, {
    ...access,
    email: access.email,
    access_source: 'checkout_welcome_email'
  });
  try {
    const delivery = await sendTransactionalEmail(env, welcomeEmail(welcomeUrl(request, env, token)), {
      to: access.email,
      logger: context.logger || console
    });
    await putAccessRecord(env, markerKey, {
      status: 'sent',
      provider: delivery.provider,
      template: 'subscriber_welcome'
    });
    return { sent: true, provider: delivery.provider };
  } catch (error) {
    await putAccessRecord(env, markerKey, {
      status: 'failed',
      code: error?.code || 'email_provider_failed',
      template: 'subscriber_welcome'
    });
    return { sent: false, reason: 'delivery_failed' };
  }
}

export async function handleCheckoutCompleted(context, session) {
  const { env } = context;
  const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
  const customer = session.customer || session.subscription?.customer || '';
  const email = session.customer_details?.email || session.customer_email || '';
  let subscription = typeof session.subscription === 'object' ? session.subscription : null;
  if (!subscription && subscriptionId) {
    subscription = await stripeGet(env, `/subscriptions/${encodeURIComponent(subscriptionId)}`);
  }

  const access = subscription ? await upsertSubscriptionAccess(env, subscription) : { access: 'unknown' };
  const payload = {
    ...access,
    checkout_session: session.id,
    customer,
    email
  };
  await putAccessRecord(env, `stripe:checkout:${session.id}`, payload);
  if (email) await putAccessRecord(env, `stripe:email:${email.toLowerCase()}`, payload);
  const vendorId = session.client_reference_id || session.metadata?.vendor_id || subscription?.metadata?.vendor_id || '';
  if (vendorId) await updateVendorBilling(env, vendorId, access);
  await sendWelcome(context, session, access);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const raw = await request.text();
  try {
    await verifyStripeWebhook(raw, request.headers.get('stripe-signature') || '', env.STRIPE_WEBHOOK_SECRET || '');
  } catch (err) {
    return json({ error: 'invalid_signature', message: err.message }, 400);
  }

  const event = JSON.parse(raw);
  if (event.type === 'checkout.session.completed') {
    await handleCheckoutCompleted(context, event.data.object);
  } else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const access = await upsertSubscriptionAccess(env, event.data.object);
    const vendorId = event.data.object?.metadata?.vendor_id || '';
    if (vendorId) await updateVendorBilling(env, vendorId, access);
  } else if (event.type === 'invoice.payment_failed') {
    await putAccessRecord(env, `stripe:invoice:${event.data.object?.id || ''}`, {
      status: 'payment_failed',
      customer: event.data.object?.customer || '',
      subscription: event.data.object?.subscription || ''
    });
  }

  return json({ received: true });
}
