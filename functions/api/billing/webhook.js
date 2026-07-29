import { json, putAccessRecord, stripeGet, upsertSubscriptionAccess, verifyStripeWebhook } from '../../_lib/stripe.mjs';
import { updateVendorBilling } from '../../_lib/vendor-profiles.mjs';

async function handleCheckoutCompleted(env, session) {
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
    await handleCheckoutCompleted(env, event.data.object);
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
