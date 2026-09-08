const INTERNAL_HOST = 'findpitches-serper.internal';
const INTERNAL_PATH = '/search';
const INTERNAL_MARKER = 'findpitches-service-binding-v1';
const MAX_RESULTS = 8;
const MAX_QUERY_LENGTH = 500;

function requireEnv(env, key) {
  const value = String(env?.[key] || '').trim();
  if (!value) throw new Error(`Missing required secret/config: ${key}`);
  return value;
}

export function isInternalSerperRequest(request) {
  let url;
  try { url = new URL(request.url); } catch { return false; }
  return request.method === 'POST'
    && url.hostname === INTERNAL_HOST
    && url.pathname === INTERNAL_PATH
    && request.headers.get('x-findpitches-internal-service') === INTERNAL_MARKER;
}

export function validateInternalSerperPayload(payload = {}) {
  const query = String(payload.q || '').trim();
  if (!query || query.length > MAX_QUERY_LENGTH) throw new Error('internal_serper_query_invalid');
  const num = Math.min(MAX_RESULTS, Math.max(1, Number(payload.num || 5)));
  return Object.freeze({ q: query, num, gl: 'uk', hl: 'en' });
}

export async function handleInternalSerperRequest(request, env, options = {}) {
  if (!isInternalSerperRequest(request)) return new Response('Not found', { status: 404 });
  let payload;
  try { payload = validateInternalSerperPayload(await request.json()); }
  catch (error) { return Response.json({ ok: false, error: String(error?.message || error) }, { status: 400 }); }

  const fetchImpl = options.fetchImpl || fetch;
  const response = await fetchImpl('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-API-KEY': requireEnv(env, 'SERPER_API_KEY')
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) return Response.json({ ok: false, error: `serper_http_${response.status}` }, { status: 502 });
  const raw = await response.json();
  const results = (raw.organic || []).slice(0, payload.num).map((item, index) => ({
    rank: index + 1,
    title: String(item.title || ''),
    link: String(item.link || ''),
    snippet: String(item.snippet || '')
  })).filter(item => /^https?:\/\//i.test(item.link));
  return Response.json({ ok: true, results });
}

export const INTERNAL_SERPER_BROKER = Object.freeze({
  host: INTERNAL_HOST,
  path: INTERNAL_PATH,
  marker: INTERNAL_MARKER,
  maximum_results: MAX_RESULTS,
  maximum_query_length: MAX_QUERY_LENGTH
});
