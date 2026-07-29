import { json } from '../../_lib/stripe.mjs';
import { profileKv } from '../../_lib/vendor-profiles.mjs';

function text(value) {
  return String(value || '').toLowerCase();
}

function includesAny(values, needle) {
  if (!needle) return true;
  return (values || []).some(value => text(value).includes(needle));
}

function publicVendor(profile) {
  if (!profile?.public_listing_opt_in) return null;
  if (profile.listing_status === 'private') return null;
  const pub = profile.public_profile || {};
  return {
    vendor_id: profile.vendor_id,
    business_name: pub.business_name || '',
    specialty: pub.specialty || '',
    description: pub.description || '',
    website: pub.website || '',
    logo_url: pub.logo_url || '',
    social_links: pub.social_links || [],
    regions: pub.regions || [],
    event_types: pub.event_types || [],
    dietary_tags: pub.dietary_tags || [],
    setup_type: pub.setup_type || '',
    public_contact_email: pub.public_contact_email || '',
    public_contact_phone: pub.public_contact_phone || '',
    listing_status: profile.listing_status || 'pending_review',
    profile_completeness: profile.profile_completeness || 0
  };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const kv = profileKv(env);
  if (!kv || typeof kv.list !== 'function') {
    return json({ ok: true, count: 0, rows: [], storage: 'not_configured' });
  }

  const url = new URL(request.url);
  const q = text(url.searchParams.get('q'));
  const region = text(url.searchParams.get('region'));
  const category = text(url.searchParams.get('category'));
  const limit = Math.min(Number(url.searchParams.get('limit') || 50), 100);
  const listed = await kv.list({ prefix: 'vendor:', limit: 1000 });
  const rows = [];

  for (const key of listed.keys || []) {
    if (!/^vendor:ven_/.test(key.name || '')) continue;
    const raw = await kv.get(key.name);
    if (!raw) continue;
    let profile;
    try {
      profile = JSON.parse(raw);
    } catch {
      continue;
    }
    const row = publicVendor(profile);
    if (!row) continue;
    const haystack = text([
      row.business_name,
      row.specialty,
      row.description,
      row.setup_type,
      ...(row.regions || []),
      ...(row.event_types || []),
      ...(row.dietary_tags || [])
    ].join(' '));
    if (q && !haystack.includes(q)) continue;
    if (region && !includesAny(row.regions, region)) continue;
    if (category && !text(row.specialty).includes(category) && !includesAny(row.event_types, category)) continue;
    rows.push(row);
    if (rows.length >= limit) break;
  }

  return json({ ok: true, count: rows.length, rows });
}
