import { json } from '../../_lib/stripe.mjs';
import { recordAnalyticsEvent } from '../../_lib/analytics.mjs';

export async function onRequestPost(context) {
  let input = {};
  try {
    input = await context.request.json();
  } catch {
    input = {};
  }
  const result = await recordAnalyticsEvent(context, input);
  return json({ ok: true, stored: result.stored });
}
