import { assertApprovedStateSources, buildStateStagingManifest } from './us-state-acquisition-core.js';
import rowCore from './us-state-row-core.js';

const { extractStateOpportunity } = rowCore;

function canonical(value) {
  try {
    const url = new URL(String(value || ''));
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

function dedupe(results = []) {
  const ids = new Set();
  const routes = new Set();
  const unique = [];
  const duplicates = [];
  for (const result of results) {
    const row = result?.row;
    if (!row) continue;
    const id = String(row.stable_id || '');
    const route = canonical(row.application_url || row.source_url);
    if ((id && ids.has(id)) || (route && routes.has(route))) {
      duplicates.push(result);
      continue;
    }
    if (id) ids.add(id);
    if (route) routes.add(route);
    unique.push(result);
  }
  return { unique, duplicates };
}

export async function runApprovedStateStaging(state, options = {}) {
  const sources = options.sources || [];
  assertApprovedStateSources(state, sources);
  if (typeof options.fetchPage !== 'function') throw new Error(`${state.name} staging runner requires injected fetchPage function`);

  const extracted = [];
  const rejected = [];
  const held = [];

  for (const source of sources) {
    const candidate = { url: source.source_url, source_id: source.id, source };
    let fetched;
    try {
      fetched = await options.fetchPage(candidate);
    } catch (error) {
      held.push({ candidate, reason: 'fetch_failed', error: String(error?.message || error) });
      continue;
    }

    const page = {
      ...fetched,
      url: fetched?.url || source.source_url,
      source_url: source.source_url,
      application_url: source.application_url,
      event_name: source.name,
      organiser: source.organiser,
      locality: source.locality,
      recurring: source.recurring ?? false,
      multi_event: source.multi_event ?? false,
      event_start: source.event_start || '',
      event_end: source.event_end || '',
      application_deadline: source.application_deadline || ''
    };

    const result = extractStateOpportunity(page, {
      state,
      resolvePostal: options.resolvePostal
    });

    if (result.status === 'rejected') {
      rejected.push({ ...result, candidate });
      continue;
    }
    if (!result.row) {
      held.push({ candidate, reason: 'missing_extracted_row' });
      continue;
    }
    if (result.status !== 'candidate') {
      held.push({ ...result, candidate });
      continue;
    }
    if (result.row.country_code !== 'US' || result.row.region_code !== state.code || result.row.jurisdiction !== state.jurisdiction) {
      held.push({ ...result, candidate, reason: 'state_boundary_mismatch' });
      continue;
    }

    result.row.source_id = source.id;
    result.row.publishable = false;
    result.row.quality_status = 'review';
    extracted.push(result);
  }

  const { unique, duplicates } = dedupe(extracted);
  const report = {
    country_code: 'US',
    region_code: state.code,
    discovered_count: sources.length,
    staged_count: unique.length,
    rejected_count: rejected.length,
    held_count: held.length,
    duplicate_count: duplicates.length,
    staging_rows: unique.map(result => result.row),
    rejected,
    held,
    duplicates
  };

  return buildStateStagingManifest(state, report, {
    runId: options.runId,
    generatedAt: options.generatedAt,
    sourceCount: sources.length
  });
}
