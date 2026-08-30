const MAX_FETCH_SUBREQUESTS_PER_BATCH = 36;

function canonicalUrl(value) {
  try {
    const url = new URL(String(value || ''));
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

export function stagingSourceBatches(sources, options = {}) {
  if (!Array.isArray(sources) || sources.length < 1) throw new Error('Staging sources are required');
  const maxSources = options.maxSources == null ? Number.POSITIVE_INFINITY : Number(options.maxSources);
  if (!(maxSources === Number.POSITIVE_INFINITY || (Number.isInteger(maxSources) && maxSources > 0))) {
    throw new Error('Maximum staging sources per batch must be a positive integer');
  }
  const batches = [[]];
  let batchBudget = 0;
  for (const source of sources) {
    const primary = canonicalUrl(source?.source_url);
    const fallback = canonicalUrl(source?.application_url);
    if (!primary || !fallback) throw new Error('Staging source URLs are required');
    const sourceBudget = primary === fallback ? 3 : 6;
    if (batches.at(-1).length >= maxSources || batchBudget + sourceBudget > MAX_FETCH_SUBREQUESTS_PER_BATCH) {
      batches.push([]);
      batchBudget = 0;
    }
    batches[batches.length - 1].push(source);
    batchBudget += sourceBudget;
  }
  return batches;
}

export function mergeStagingBatches(state, manifests) {
  if (!Array.isArray(manifests) || manifests.length < 1) throw new Error('Staging batch manifests are required');
  const rows = [];
  const rejected = [];
  const held = [];
  const duplicates = [];
  const evidenceReceipts = [];
  const stableIds = new Set();
  const routes = new Set();
  let sourceCount = 0;
  let discoveredCount = 0;

  for (const manifest of manifests) {
    if (manifest?.country_code !== 'US' || manifest?.region_code !== state.code
      || manifest?.mode !== 'addition-only' || manifest?.staging_only !== true
      || manifest?.automatic_publish !== false || manifest?.production_writes !== false) {
      throw new Error(`${state.name} staging batch escaped controlled state boundaries`);
    }
    if (manifest.jurisdiction && manifest.jurisdiction !== state.jurisdiction) {
      throw new Error(`${state.name} staging batch escaped ${state.jurisdiction}`);
    }
    sourceCount += Number(manifest.source_count || 0);
    discoveredCount += Number(manifest.discovered_count || 0);
    rejected.push(...(manifest.rejected || []));
    held.push(...(manifest.held || []));
    duplicates.push(...(manifest.duplicates || []));
    const receiptsBySource = new Map((manifest.evidence_receipts || []).map(receipt => [receipt?.source_id, receipt]));

    for (const row of manifest.rows || []) {
      const stableId = String(row?.stable_id || '');
      const route = canonicalUrl(row?.application_url || row?.source_url);
      if ((stableId && stableIds.has(stableId)) || (route && routes.has(route))) {
        duplicates.push({ status: 'duplicate', reason: 'cross_batch_duplicate', row });
        continue;
      }
      if (stableId) stableIds.add(stableId);
      if (route) routes.add(route);
      rows.push(row);
      const receipt = receiptsBySource.get(row?.source_id);
      if (!receipt || receipt.application_route_attested !== true) {
        throw new Error(`${state.name} staging row is missing a passed evidence receipt`);
      }
      evidenceReceipts.push(receipt);
    }
  }

  return {
    run_id: `cloudflare-${state.slug}-batched`,
    generated_at: manifests[0].generated_at || null,
    country_code: 'US',
    region_code: state.code,
    jurisdiction: state.jurisdiction,
    mode: 'addition-only',
    staging_only: true,
    automatic_publish: false,
    production_writes: false,
    source_count: sourceCount,
    discovered_count: discoveredCount,
    staged_count: rows.length,
    rejected_count: rejected.length,
    held_count: held.length,
    duplicate_count: duplicates.length,
    rows,
    rejected,
    held,
    duplicates,
    evidence_receipts: evidenceReceipts
  };
}

export { MAX_FETCH_SUBREQUESTS_PER_BATCH };
