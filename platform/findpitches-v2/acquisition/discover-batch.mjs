import { getMarket } from '../markets/registry.mjs';
import { buildQueries } from '../queries/templates.mjs';
import { canonicalUrl } from '../engine/candidate.mjs';

export async function discoverBatch(job = {}, dependencies = {}) {
  const market = getMarket(job.market);
  const regionCode = String(job.region_code || job.regionCode || '').trim().toUpperCase();
  const location = String(job.location || '').trim();
  if (!regionCode) throw new Error('findpitches_v2_discovery_region_missing');
  if (!location) throw new Error('findpitches_v2_discovery_location_missing');
  if (typeof dependencies.searchProvider?.search !== 'function') {
    throw new Error('findpitches_v2_discovery_search_provider_missing');
  }

  const queryLimit = Math.max(1, Number(job.query_limit ?? job.queryLimit ?? 8) || 8);
  const queries = buildQueries({ market, location, limit: queryLimit });
  const startedAt = new Date().toISOString();
  const searchResults = [];
  const searchErrors = [];

  for (const query of queries) {
    try {
      const response = await dependencies.searchProvider.search({
        market,
        region_code: regionCode,
        ...query
      });
      const results = Array.isArray(response) ? response : Array.isArray(response?.results) ? response.results : [];
      for (const result of results) {
        searchResults.push({ ...result, query_id: query.template_id, query: query.query });
      }
    } catch (error) {
      searchErrors.push({
        query_id: query.template_id,
        query: query.query,
        error: String(error?.message || error)
      });
    }
  }

  const seen = new Set();
  const candidates = [];

  for (const result of searchResults) {
    if (!result?.url) continue;
    let url;
    try {
      url = canonicalUrl(result.url);
    } catch {
      continue;
    }
    if (!url || seen.has(url)) continue;
    seen.add(url);

    candidates.push(Object.freeze({
      candidate_id: await stableCandidateId(url),
      discovery_market: market.code,
      discovery_region_code: regionCode,
      discovery_location: location,
      source_url: url,
      canonical_url: url,
      search_title: result.title || null,
      search_snippet: result.snippet || null,
      query_id: result.query_id || null,
      query: result.query || null,
      status: 'discovered'
    }));
  }

  return Object.freeze({
    engine: 'findpitches-v2-acquisition',
    market: market.code,
    region: regionCode,
    location,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    queries: Object.freeze([...queries]),
    search_errors: Object.freeze(searchErrors),
    candidates: Object.freeze(candidates),
    metrics: Object.freeze({
      queries: queries.length,
      search_results: searchResults.length,
      unique_urls: candidates.length,
      discovered: candidates.length,
      search_errors: searchErrors.length
    })
  });
}

async function stableCandidateId(url) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(String(url).toLowerCase())
  );
  const hex = [...new Uint8Array(digest)]
    .map(value => value.toString(16).padStart(2, '0'))
    .join('');
  return `fpv2_${hex.slice(0, 24)}`;
}
