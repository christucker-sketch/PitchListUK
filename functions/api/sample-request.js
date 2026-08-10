function json(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

function clean(value, limit = 1000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function emailValid(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(String(value || ''));
}

function sampleText(payload) {
  return payload.body || [
    'Free sample request',
    '',
    `Name: ${payload.name}`,
    `Business: ${payload.business}`,
    `Email: ${payload.email}`,
    `Base town/postcode: ${payload.base_location}`,
    `Max travel range: ${payload.travel_radius}`,
    `Useful counties/notes: ${payload.area_notes || '(not specified)'}`,
    `Map-selected region IDs: ${(payload.selected_region_ids || []).join(', ') || '(none selected)'}`,
    `Map-selected regions: ${(payload.selected_regions || []).join(', ') || '(none selected)'}`,
    `Expanded counties/areas from map: ${(payload.selected_counties || []).join(', ') || '(none selected)'}`,
    '',
    'Please check whether my area/category needs manual review beyond the searchable pitch finder preview.'
  ].join('\n');
}

async function sendWebhook(env, payload, text) {
  const url = env.PITCHLIST_SAMPLE_WEBHOOK_URL || '';
  if (!url) return null;
  const headers = { 'content-type': 'application/json' };
  if (env.PITCHLIST_SAMPLE_WEBHOOK_TOKEN) {
    headers.authorization = `Bearer ${env.PITCHLIST_SAMPLE_WEBHOOK_TOKEN}`;
  }
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...payload, text, source: 'pitchlist.uk sample form' })
  });
  if (!response.ok) throw new Error(`Webhook failed with HTTP ${response.status}`);
  return { provider: 'webhook' };
}

async function sendSmtp2go(env, payload, text) {
  const apiKey = env.PITCHLIST_FORM_SMTP2GO_API_KEY || env.SMTP2GO_API_KEY || '';
  if (!apiKey) return null;
  const sender = env.PITCHLIST_FORM_FROM || 'hello@pitchlist.uk';
  const recipient = env.PITCHLIST_FORM_TO || 'hello@pitchlist.uk';
  const response = await fetch('https://api.smtp2go.com/v3/email/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      to: [recipient],
      sender,
      subject: `PitchList UK free sample request - ${payload.business}`,
      text_body: text,
      custom_headers: [
        { header: 'Reply-To', value: payload.email }
      ]
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.data?.error_code) {
    throw new Error(`SMTP2GO failed with HTTP ${response.status}`);
  }
  return { provider: 'smtp2go' };
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const raw = await request.text();
  if (raw.length > 20000) return json({ error: 'payload_too_large' }, 413);

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const payload = {
    name: clean(input.name, 120),
    business: clean(input.business, 160),
    email: clean(input.email, 180),
    base_location: clean(input.base_location, 160),
    travel_radius: clean(input.travel_radius, 80),
    area_notes: clean(input.area_notes, 1200),
    selected_region_ids: Array.isArray(input.selected_region_ids) ? input.selected_region_ids.map(value => clean(value, 80)).filter(Boolean) : [],
    selected_regions: Array.isArray(input.selected_regions) ? input.selected_regions.map(value => clean(value, 120)).filter(Boolean) : [],
    selected_counties: Array.isArray(input.selected_counties) ? input.selected_counties.map(value => clean(value, 120)).filter(Boolean) : [],
    body: String(input.body || '').trim().slice(0, 8000)
  };

  const missing = ['name', 'business', 'email', 'base_location', 'travel_radius'].filter(field => !payload[field]);
  if (missing.length) return json({ error: 'missing_fields', missing }, 400);
  if (!emailValid(payload.email)) return json({ error: 'invalid_email' }, 400);

  const text = sampleText(payload);
  const delivery = await sendWebhook(env, payload, text) || await sendSmtp2go(env, payload, text);
  if (!delivery) {
    return json({
      error: 'delivery_not_configured',
      message: 'Sample request delivery is not configured.',
      mailto: `mailto:hello@pitchlist.uk?subject=${encodeURIComponent('PitchList UK free sample request')}&body=${encodeURIComponent(text)}`
    }, 503);
  }

  return json({ ok: true, delivery });
}
