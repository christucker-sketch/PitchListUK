const DEFAULT_ENDPOINT = 'https://google.serper.dev/search';

export function createSerperSearchProvider({
  apiKey,
  fetchImpl = fetch,
  endpoint = DEFAULT_ENDPOINT,
  resultsPerQuery = 10
} = {}) {
  const key = String(apiKey || '').trim();
  if (!key) throw new Error('findpitches_v2_search_api_key_missing');
  if (typeof fetchImpl !== 'function') throw new Error('findpitches_v2_search_fetch_invalid');

  return Object.freeze({
    async search({ market, query }) {
      if (!market?.search?.gl || !market?.search?.hl) {
        throw new Error('findpitches_v2_search_market_config_missing');
      }

      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-API-KEY': key
        },
        body: JSON.stringify({
          q: String(query || '').trim(),
          gl: market.search.gl,
          hl: market.search.hl,
          num: Math.max(1, Math.min(20, Number(resultsPerQuery) || 10))
        })
      });

      if (!response.ok) {
        throw new Error(`findpitches_v2_search_http_${response.status}`);
      }

      const payload = await response.json();
      const organic = Array.isArray(payload?.organic) ? payload.organic : [];

      return organic
        .filter(item => item?.link)
        .map(item => Object.freeze({
          url: String(item.link),
          title: String(item.title || '').trim() || null,
          snippet: String(item.snippet || '').trim() || null,
          position: Number.isFinite(Number(item.position)) ? Number(item.position) : null,
          provider: 'serper'
        }));
    }
  });
}

export { DEFAULT_ENDPOINT as SERPER_ENDPOINT };
