import { json, normaliseEmail } from './stripe.mjs';

const PROFILE_COOKIE_SECONDS = 60 * 60 * 24 * 365;
const VENDOR_ID_PREFIX = 'ven';

function clean(value, max = 240) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanList(value, maxItems = 30) {
  const items = Array.isArray(value) ? value : String(value || '').split(/[,;\n]/);
  return [...new Set(items.map(item => clean(item, 80)).filter(Boolean))].slice(0, maxItems);
}

function bool(value) {
  return value === true || value === 'true' || value === '1' || value === 'on';
}

function emailValid(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(String(value || ''));
}

function randomHex(bytes = 18) {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return [...array].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function vendorId() {
  return `${VENDOR_ID_PREFIX}_${randomHex(10)}`;
}

export function vendorToken() {
  return randomHex(32);
}

export function vendorCookie(token) {
  return [
    `pitchlist_vendor_token=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${PROFILE_COOKIE_SECONDS}`,
    'SameSite=Lax',
    'Secure',
    'HttpOnly'
  ].join('; ');
}

export function getCookie(request, name) {
  const cookie = request.headers.get('cookie') || '';
  for (const part of cookie.split(';')) {
    const [rawKey, ...rest] = part.trim().split('=');
    if (rawKey === name) return decodeURIComponent(rest.join('=') || '');
  }
  return '';
}

export function profileKv(env) {
  return env.PITCHLIST_VENDOR_KV || env.PITCHLIST_ACCESS_KV || null;
}

async function putJson(kv, key, value) {
  await kv.put(key, JSON.stringify({ ...value, updated_at: new Date().toISOString() }));
}

async function getJson(kv, key) {
  const raw = await kv.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function profileCompleteness(profile) {
  const required = [
    profile.public_profile?.business_name,
    profile.private_account?.email,
    profile.public_profile?.specialty,
    profile.public_profile?.base_location,
    profile.public_profile?.regions?.length
  ];
  const optional = [
    profile.public_profile?.description,
    profile.public_profile?.website,
    profile.public_profile?.setup_type,
    profile.public_profile?.event_types?.length,
    profile.public_profile?.public_contact_email
  ];
  return Math.round((required.filter(Boolean).length * 14) + (optional.filter(Boolean).length * 6));
}

export function normaliseProfileInput(input = {}, existing = null) {
  const now = new Date().toISOString();
  const email = normaliseEmail(input.email || input.primary_email || existing?.private_account?.email || '');
  const publicOptIn = bool(input.public_listing_opt_in ?? existing?.public_listing_opt_in);
  const profile = {
    schema: 'pitchlist_vendor_profile_v1',
    vendor_id: existing?.vendor_id || clean(input.vendor_id, 80) || vendorId(),
    created_at: existing?.created_at || now,
    updated_at: now,
    profile_status: 'incomplete',
    public_listing_opt_in: publicOptIn,
    listing_status: publicOptIn ? (existing?.listing_status || 'pending_review') : 'private',
    private_account: {
      contact_name: clean(input.contact_name ?? existing?.private_account?.contact_name, 120),
      email,
      phone: clean(input.phone ?? existing?.private_account?.phone, 80),
      base_postcode: clean(input.base_postcode ?? input.postcode ?? existing?.private_account?.base_postcode, 40),
      stripe_customer_id: clean(input.stripe_customer_id ?? existing?.private_account?.stripe_customer_id, 120),
      stripe_subscription_id: clean(input.stripe_subscription_id ?? existing?.private_account?.stripe_subscription_id, 120),
      subscription_status: clean(input.subscription_status ?? existing?.private_account?.subscription_status, 80)
    },
    public_profile: {
      business_name: clean(input.business_name ?? input.company_name ?? existing?.public_profile?.business_name, 160),
      specialty: clean(input.specialty ?? input.category ?? existing?.public_profile?.specialty, 160),
      description: clean(input.description ?? existing?.public_profile?.description, 500),
      website: clean(input.website ?? existing?.public_profile?.website, 240),
      logo_url: clean(input.logo_url ?? existing?.public_profile?.logo_url, 240),
      social_links: cleanList(input.social_links ?? existing?.public_profile?.social_links, 12),
      regions: cleanList(input.regions ?? input.areas ?? existing?.public_profile?.regions, 60),
      event_types: cleanList(input.event_types ?? existing?.public_profile?.event_types, 30),
      dietary_tags: cleanList(input.dietary_tags ?? existing?.public_profile?.dietary_tags, 30),
      setup_type: clean(input.setup_type ?? existing?.public_profile?.setup_type, 120),
      power_needs: clean(input.power_needs ?? existing?.public_profile?.power_needs, 160),
      water_needs: clean(input.water_needs ?? existing?.public_profile?.water_needs, 160),
      insurance_notes: clean(input.insurance_notes ?? existing?.public_profile?.insurance_notes, 240),
      public_contact_email: normaliseEmail(input.public_contact_email || existing?.public_profile?.public_contact_email || email),
      public_contact_phone: clean(input.public_contact_phone ?? existing?.public_profile?.public_contact_phone, 80)
    },
    source: {
      signup_source: clean(input.signup_source || existing?.source?.signup_source || 'database_subscription_signup', 120),
      last_source: clean(input.last_source || 'profile_backend', 120)
    }
  };
  profile.profile_completeness = profileCompleteness(profile);
  if (profile.profile_completeness >= 70) profile.profile_status = 'usable';
  if (!profile.public_listing_opt_in) {
    profile.public_profile.public_contact_email = '';
    profile.public_profile.public_contact_phone = '';
  }
  return profile;
}

export function assertProfileInput(profile) {
  if (!emailValid(profile.private_account.email)) return 'A valid email is required.';
  if (!profile.public_profile.business_name) return 'Business name is required.';
  if (!profile.public_profile.specialty) return 'Business type or specialty is required.';
  return '';
}

export async function saveVendorProfile(env, profile, token = '') {
  const kv = profileKv(env);
  if (!kv || typeof kv.put !== 'function') return { stored: false };
  const editToken = token || vendorToken();
  await putJson(kv, `vendor:${profile.vendor_id}`, profile);
  await putJson(kv, `vendor:email:${profile.private_account.email}`, {
    vendor_id: profile.vendor_id,
    email: profile.private_account.email
  });
  await putJson(kv, `vendor:token:${editToken}`, {
    vendor_id: profile.vendor_id,
    email: profile.private_account.email
  });
  return { stored: true, token: editToken };
}

export async function loadVendorByToken(env, token) {
  const kv = profileKv(env);
  if (!kv || typeof kv.get !== 'function' || !token) return null;
  const ref = await getJson(kv, `vendor:token:${token}`);
  if (!ref?.vendor_id) return null;
  return getJson(kv, `vendor:${ref.vendor_id}`);
}

export async function loadVendorById(env, id) {
  const kv = profileKv(env);
  if (!kv || typeof kv.get !== 'function' || !id) return null;
  return getJson(kv, `vendor:${id}`);
}

export async function updateVendorBilling(env, vendor_id, billing) {
  const existing = await loadVendorById(env, vendor_id);
  if (!existing) return { updated: false };
  const profile = normaliseProfileInput({
    ...existing.public_profile,
    ...existing.private_account,
    vendor_id,
    stripe_customer_id: billing.customer,
    stripe_subscription_id: billing.subscription,
    subscription_status: billing.status,
    last_source: 'stripe_webhook'
  }, existing);
  const saved = await saveVendorProfile(env, profile);
  return { updated: saved.stored, profile };
}

export function profileResponse(profile, stored = true) {
  return {
    ok: true,
    stored,
    vendor_id: profile.vendor_id,
    profile_status: profile.profile_status,
    listing_status: profile.listing_status,
    profile_completeness: profile.profile_completeness,
    public_listing_opt_in: profile.public_listing_opt_in,
    private_account: profile.private_account,
    public_profile: profile.public_profile
  };
}

export function profileError(message, status = 400) {
  return json({ ok: false, error: 'profile_invalid', message }, status);
}
