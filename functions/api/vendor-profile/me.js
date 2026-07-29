import {
  assertProfileInput,
  getCookie,
  loadVendorByToken,
  normaliseProfileInput,
  profileError,
  profileResponse,
  saveVendorProfile,
  vendorCookie
} from '../../_lib/vendor-profiles.mjs';
import { json } from '../../_lib/stripe.mjs';

function tokenFrom(request) {
  const url = new URL(request.url);
  return String(url.searchParams.get('token') || getCookie(request, 'pitchlist_vendor_token') || '').trim();
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const token = tokenFrom(request);
  const profile = await loadVendorByToken(env, token);
  if (!profile) return json({ ok: false, error: 'profile_not_found' }, 404);
  return json(profileResponse(profile));
}

export async function onRequestPut(context) {
  const { request, env } = context;
  const token = tokenFrom(request);
  const existing = await loadVendorByToken(env, token);
  if (!existing) return json({ ok: false, error: 'profile_not_found' }, 404);

  let input = {};
  try {
    input = await request.json();
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  const profile = normaliseProfileInput(input, existing);
  const error = assertProfileInput(profile);
  if (error) return profileError(error);

  const saved = await saveVendorProfile(env, profile, token);
  return json(profileResponse(profile, saved.stored), 200, saved.token ? {
    'set-cookie': vendorCookie(saved.token)
  } : {});
}
