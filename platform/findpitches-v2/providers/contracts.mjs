export function createSearchProvider(search) {
  if (typeof search !== 'function') throw new Error('findpitches_v2_search_provider_invalid');
  return Object.freeze({ search });
}

export function createFetchProvider(fetchPage) {
  if (typeof fetchPage !== 'function') throw new Error('findpitches_v2_fetch_provider_invalid');
  return Object.freeze({ fetch: fetchPage });
}

export function createCandidateEvaluator(evaluate) {
  if (typeof evaluate !== 'function') throw new Error('findpitches_v2_candidate_evaluator_invalid');
  return evaluate;
}
