import { analyticsAuth, analyticsError, listAnalyticsEvents, summariseAnalytics } from '../../_lib/analytics.mjs';
import { json } from '../../_lib/stripe.mjs';

export async function onRequestGet(context) {
  const auth = analyticsAuth(context.request, context.env);
  if (!auth.ok) return analyticsError(auth.error, auth.status);
  const url = new URL(context.request.url);
  const days = Math.min(Math.max(Number(url.searchParams.get('days') || 7), 1), 45);
  const listed = await listAnalyticsEvents(context.env, days);
  const summary = summariseAnalytics(listed.events);
  return json({
    ok: true,
    stored: listed.stored,
    days,
    ...summary
  }, 200, { 'cache-control': 'no-store' });
}
