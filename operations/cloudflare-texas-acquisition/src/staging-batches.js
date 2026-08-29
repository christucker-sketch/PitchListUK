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

export function stagingSourceBatches(sources) {
  if (!Array.isArray(sources) || sources.length < 1) throw new Error('Staging sources are required');
  const batches = [[]];
  let batchBudget = 0;
  for (const source of sources) {
    const primary = canonicalUrl(source?.source_url);
    const fallback = canonicalUrl(source?.application_url);
    if (!primary || !fallback) throw new Error('Staging source URLs are required');
    const sourceBudget = primary === fallback ? 3 : 6;
    if (batchBudget + sourceBudget > MAX_FETCH_SUBREQUESTS_PER_BATCH) {
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
    duplicates
  };
}

export { MAX_FETCH_SUBREQUESTS_PER_BATCH };
