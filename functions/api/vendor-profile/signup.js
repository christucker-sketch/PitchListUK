import {
  assertProfileInput,
  normaliseProfileInput,
  profileError,
  profileResponse,
  saveVendorProfile,
  vendorCookie
} from '../../_lib/vendor-profiles.mjs';
import { json } from '../../_lib/stripe.mjs';

export async function onRequestPost(context) {
  const { request, env } = context;
  let input = {};
  try {
    input = await request.json();
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  const profile = normaliseProfileInput(input);
  const error = assertProfileInput(profile);
  if (error) return profileError(error);

  const saved = await saveVendorProfile(env, profile);
  return json(profileResponse(profile, saved.stored), saved.stored ? 201 : 202, saved.token ? {
    'set-cookie': vendorCookie(saved.token)
  } : {});
}
