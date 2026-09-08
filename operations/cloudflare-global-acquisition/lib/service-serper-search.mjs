const INTERNAL_SERPER_URL = 'https://findpitches-serper.internal/search';
const INTERNAL_MARKER = 'findpitches-service-binding-v1';

export async function searchViaSerperBroker(env, query, options = {}) {
  if (!env?.SERPER_BROKER || typeof env.SERPER_BROKER.fetch !== 'function') {
    throw new Error('SERPER_BROKER service binding is unavailable');
  }
  const num = Math.min(8, Math.max(1, Number(options.num || 5)));
  const response = await env.SERPER_BROKER.fetch(new Request(INTERNAL_SERPER_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-findpitches-internal-service': INTERNAL_MARKER
    },
    body: JSON.stringify({ q: String(query || ''), num })
  }));
  const body = await response.json();
  if (!response.ok || body?.ok !== true) throw new Error(`Internal Serper broker failed: ${body?.error || response.status}`);
  return (body.results || []).map(item => ({
    query,
    rank: Number(item.rank || 0),
    title: String(item.title || ''),
    url: String(item.link || ''),
    snippet: String(item.snippet || '')
  }));
}
