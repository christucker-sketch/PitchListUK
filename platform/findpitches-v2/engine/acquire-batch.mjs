import { getMarket } from '../markets/registry.mjs';
import { buildQueries } from '../queries/templates.mjs';
import { canonicalUrl } from './candidate.mjs';

export async function acquireBatch(job = {}, dependencies = {}) {
  const market = getMarket(job.market);
  const regionCode = String(job.region_code || job.regionCode || '').trim().toUpperCase();
  if (!regionCode) throw new Error('findpitches_v2_batch_region_missing');

  const location = String(job.location || '').trim();
  if (!location) throw new Error('findpitches_v2_batch_location_missing');

  const searchProvider = requireFunction(dependencies.searchProvider?.search, 'search_provider');
  const evaluateCandidate = requireFunction(dependencies.evaluateCandidate, 'candidate_evaluator');
  const queryLimit = Math.max(1, Number(job.query_limit ?? job.queryLimit ?? 8) || 8);
  const queries = buildQueries({ market, location, limit: queryLimit });

  const startedAt = new Date().toISOString();
  const searchResults = [];
  const searchErrors = [];

  for (const query of queries) {
    try {
      const response = await searchProvider({ market, region_code: regionCode, ...query });
      const results = Array.isArray(response) ? response : Array.isArray(response?.results) ? response.results : [];
      for (const result of results) searchResults.push({ ...result, query_id: query.template_id, query: query.query });
    } catch (error) {
      searchErrors.push({
        query_id: query.template_id,
        query: query.query,
        error: String(error?.message || error)
      });
    }
  }

  const uniqueResults = dedupeSearchResults(searchResults);
  const buckets = {
    candidates: [],
    validated: [],
    duplicates: [],
    held: [],
    rejected: [],
    publishable: []
  };

  for (const result of uniqueResults) {
    try {
      const evaluated = await evaluateCandidate({
        market,
        region_code: regionCode,
        location,
        result
      });

      if (!evaluated) continue;
      buckets.candidates.push(evaluated);

      const status = String(evaluated.status || '').trim();
      if (status === 'duplicate') buckets.duplicates.push(evaluated);
      else if (status === 'held') buckets.held.push(evaluated);
      else if (status === 'rejected') buckets.rejected.push(evaluated);
      else if (status === 'validated' || status === 'queued_for_publish') {
        buckets.validated.push(evaluated);
        if (evaluated.publishable === true || status === 'queued_for_publish') buckets.publishable.push(evaluated);
      }
    } catch (error) {
      buckets.rejected.push({
        source_url: result.url || null,
        status: 'rejected',
        rejection_reason: String(error?.message || error)
      });
    }
  }

  return Object.freeze({
    engine: 'findpitches-v2',
    market: market.code,
    region: regionCode,
    location,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    queries: Object.freeze([...queries]),
    search_errors: Object.freeze(searchErrors),
    results: Object.freeze(uniqueResults),
    candidates: Object.freeze(buckets.candidates),
    validated: Object.freeze(buckets.validated),
    duplicates: Object.freeze(buckets.duplicates),
    held: Object.freeze(buckets.held),
    rejected: Object.freeze(buckets.rejected),
    publishable: Object.freeze(buckets.publishable),
    metrics: Object.freeze({
      queries: queries.length,
      search_results: searchResults.length,
      unique_urls: uniqueResults.length,
      candidates: buckets.candidates.length,
      validated: buckets.validated.length,
      duplicates: buckets.duplicates.length,
      held: buckets.held.length,
      rejected: buckets.rejected.length,
      publishable: buckets.publishable.length,
      search_errors: searchErrors.length
    })
  });
}

function dedupeSearchResults(results) {
  const seen = new Set();
  const unique = [];

  for (const item of results) {
    if (!item?.url) continue;

    let url;
    try {
      url = canonicalUrl(item.url);
    } catch {
      continue;
    }

    if (!url || seen.has(url)) continue;
    seen.add(url);
    unique.push(Object.freeze({ ...item, url }));
  }

  return unique;
}

function requireFunction(value, name) {
  if (typeof value !== 'function') throw new Error(`findpitches_v2_${name}_missing`);
  return value;
}
