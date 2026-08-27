const { extractTexasOpportunity } = require('./us-opportunity-extractor');
const { validateTexasPilotRow } = require('./us-acquisition-classifier');
const { assertUsAcquisitionFramework, US_ACQUISITION_FRAMEWORK } = require('../config/us-acquisition-framework');

function canonicalUrl(value) {
  try {
    const url = new URL(String(value || ''));
    url.hash = '';
    ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid'].forEach(key => url.searchParams.delete(key));
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

function dedupeTexasCandidates(results = []) {
  const seenIds = new Set();
  const seenRoutes = new Set();
  const unique = [];
  const duplicates = [];

  for (const result of results) {
    if (!result || !result.row) continue;
    const id = result.row.stable_id || '';
    const route = canonicalUrl(result.row.application_url || result.row.source_url);
    if ((id && seenIds.has(id)) || (route && seenRoutes.has(route))) {
      duplicates.push(result);
      continue;
    }
    if (id) seenIds.add(id);
    if (route) seenRoutes.add(route);
    unique.push(result);
  }
  return { unique, duplicates };
}

async function runTexasAcquisitionCycle(options = {}) {
  const config = options.config || US_ACQUISITION_FRAMEWORK;
  assertUsAcquisitionFramework(config);

  const discover = options.discover;
  const fetchPage = options.fetchPage;
  if (typeof discover !== 'function') throw new Error('US acquisition cycle requires injected discover function');
  if (typeof fetchPage !== 'function') throw new Error('US acquisition cycle requires injected fetchPage function');

  const discovered = await discover({
    country_code: 'US',
    region_code: 'TX',
    queries: config.discoveryQueries,
    max_results: config.maxDiscoveryResults,
    credit_budget: config.serperCreditBudget
  });

  const candidates = Array.isArray(discovered) ? discovered.slice(0, config.maxFetchesPerRun) : [];
  const extracted = [];
  const rejected = [];
  const held = [];

  for (const candidate of candidates) {
    const sourceUrl = canonicalUrl(candidate?.url || candidate?.source_url);
    if (!sourceUrl) {
      held.push({ candidate, reason: 'invalid_source_url' });
      continue;
    }

    let page;
    try {
      page = await fetchPage({ ...candidate, url: sourceUrl, country_code: 'US', region_code: 'TX' });
    } catch (error) {
      held.push({ candidate, reason: 'fetch_failed', error: String(error?.message || error) });
      continue;
    }

    const result = extractTexasOpportunity({ ...page, url: page?.url || sourceUrl }, { zipIndex: options.zipIndex });
    if (result.status === 'rejected') {
      rejected.push(result);
      continue;
    }
    if (!result.row) {
      held.push({ candidate, reason: 'missing_extracted_row' });
      continue;
    }

    const validation = validateTexasPilotRow(result.row);
    if (!validation.valid || result.status !== 'candidate') {
      held.push({ ...result, validation });
      continue;
    }

    result.row.publishable = false;
    result.row.quality_status = 'review';
    extracted.push(result);
  }

  const { unique, duplicates } = dedupeTexasCandidates(extracted);
  const stagingRows = unique.map(result => ({ ...result.row, publishable: false, quality_status: 'review' }));

  return {
    mode: 'staging-only',
    country_code: 'US',
    region_code: 'TX',
    discovered_count: candidates.length,
    staged_count: stagingRows.length,
    rejected_count: rejected.length,
    held_count: held.length,
    duplicate_count: duplicates.length,
    staging_rows: stagingRows,
    rejected,
    held,
    duplicates
  };
}

module.exports = { canonicalUrl, dedupeTexasCandidates, runTexasAcquisitionCycle };
