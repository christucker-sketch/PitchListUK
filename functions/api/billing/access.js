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

function accessUrl(request, token) {
  const url = new URL(request.url);
  return `${url.origin}/find-pitches?access_token=${encodeURIComponent(token)}`;
}

async function sendAccessEmail(env, email, link) {
  const apiKey = env.PITCHLIST_FORM_SMTP2GO_API_KEY || env.SMTP2GO_API_KEY || '';
  if (!apiKey) return null;
  const sender = env.PITCHLIST_FORM_FROM || 'hello@pitchlist.uk';
  const response = await fetch('https://api.smtp2go.com/v3/email/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      to: [email],
      sender,
      subject: 'Your PitchList UK pitch finder access link',
      text_body: [
        'Use this link to unlock your PitchList UK pitch finder access:',
        '',
        link,
        '',
        'This link is for your subscriber access and expires after 30 days.'
      ].join('\n')
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.data?.error_code) throw new Error(`SMTP2GO failed with HTTP ${response.status}`);
  return { provider: 'smtp2go' };
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
  const delivery = await sendAccessEmail(env, email, link);
  const isPreview = /(^|\.)pages\.dev$/i.test(new URL(request.url).hostname) || env.CF_PAGES_BRANCH !== 'main';

  return json({
    ok: true,
    sent: Boolean(delivery),
    delivery: delivery?.provider || (isPreview ? 'preview_link' : 'not_configured'),
    message: delivery ? 'Access link sent.' : 'Access link created.',
    preview_url: delivery ? undefined : (isPreview ? link : undefined)
  });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = String(url.searchParams.get('token') || '').trim();
  if (!token) return json({ error: 'missing_token' }, 400);

  const entitlement = resolveCanonicalEntitlement(await resolveCanonicalTokenBinding(env, token));
  if (!entitlement.allowed) return json({ error: 'invalid_or_expired_token' }, 404);

  return json({
    ok: true,
    access: 'subscriber',
    email: entitlement.email,
    customer: entitlement.customer,
    subscription_status: entitlement.status
  }, 200, {
    'set-cookie': accessTokenCookie(token)
  });
}
