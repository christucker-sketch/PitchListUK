// Server-to-server authentication for the FindPitches v2 customer API.
//
// The customer API is called only by the FindPitches website's server-side layer, never by browsers.
// Tokens are supplied as a Worker secret: FINDPITCHES_CUSTOMER_API_TOKENS (comma-separated, so a new
// token can be added before an old one is removed). With no tokens configured the API fails closed.
//
// Market/region metadata stays protected unless FINDPITCHES_CUSTOMER_API_PUBLIC_METADATA === 'true'
// (a product decision; default off).

const PUBLIC_METADATA_PATHS = new Set(['/v1/markets', '/v1/regions']);

export function configuredCustomerTokens(env = {}) {
  return String(env?.FINDPITCHES_CUSTOMER_API_TOKENS || '')
    .split(',')
    .map(token => token.trim())
    .filter(token => token.length >= 32);
}

export function metadataIsPublic(env = {}, path = '') {
  return String(env?.FINDPITCHES_CUSTOMER_API_PUBLIC_METADATA || '').toLowerCase() === 'true' && PUBLIC_METADATA_PATHS.has(path);
}

// Returns { ok: true } or { ok: false, status, error } — never reveals which part failed.
export async function authorizeCustomerRequest(request, env = {}, path = '') {
  const tokens = configuredCustomerTokens(env);
  if (!tokens.length) return Object.freeze({ ok: false, status: 503, error: 'customer_api_not_configured' });
  if (metadataIsPublic(env, path)) return Object.freeze({ ok: true, principal: 'public' });

  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(\S+)$/i);
  if (!match) return Object.freeze({ ok: false, status: 401, error: 'unauthorized' });

  const presented = await digest(match[1]);
  let matched = false;
  for (const token of tokens) {
    // Compare digests of equal length; every configured token is checked (no early exit).
    if (equal(presented, await digest(token))) matched = true;
  }
  return matched ? Object.freeze({ ok: true, principal: 'service' }) : Object.freeze({ ok: false, status: 401, error: 'unauthorized' });
}

async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return new Uint8Array(bytes);
}

function equal(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
