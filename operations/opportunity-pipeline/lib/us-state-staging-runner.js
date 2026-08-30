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

function normaliseDate(value) {
  const date = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '';
}

function stagingDate(generatedAt) {
  const explicit = String(generatedAt || '').slice(0, 10);
  return normaliseDate(explicit) || new Date().toISOString().slice(0, 10);
}

const MONTHS = Object.freeze({
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12'
});

function explicitNamedDates(value, defaultYear, sentenceFilter) {
  const dates = new Set();
  const sentences = String(value || '').split(/[.!?\n]+/);
  const pattern = /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?\b/gi;
  for (const sentence of sentences) {
    if (!sentenceFilter(sentence)) continue;
    for (const match of sentence.matchAll(pattern)) {
      const year = match[3] || defaultYear;
      const month = MONTHS[match[1].toLowerCase()];
      const day = String(Number(match[2])).padStart(2, '0');
      const date = normaliseDate(`${year}-${month}-${day}`);
      if (date && Number(day) >= 1 && Number(day) <= 31) dates.add(date);
    }
  }
  return [...dates].sort();
}

export function explicitApplicationDeadlines(value, defaultYear) {
  return explicitNamedDates(value, defaultYear, sentence =>
    /\b(?:applications?|applying|apply)\b/i.test(sentence) &&
    /\b(?:close[sd]?|closing|deadline|due|through|until|by)\b/i.test(sentence)
  );
}

export function explicitLiveEventDates(value, defaultYear) {
  return explicitNamedDates(value, defaultYear, sentence =>
    /\b(?:event|market|festival|fair)\b/i.test(sentence) &&
    !/\b(?:applications?|applying|apply)\b[^.]{0,120}\b(?:close[sd]?|closing|deadline|due)\b/i.test(sentence)
  );
}

export function explicitApplicationYears(value) {
  const years = new Set();
  const sentences = String(value || '').split(/[.!?\n]+/);
  for (const sentence of sentences) {
    if (!/\b(applications?|apply|applying)\b/i.test(sentence)) continue;
    for (const match of sentence.matchAll(/\b(20\d{2})\b/g)) years.add(match[1]);
  }
  return [...years].sort();
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
  const asOfDate = stagingDate(options.generatedAt);

  for (const source of sources) {
    const candidate = { url: source.source_url, source_id: source.id, source };
    const applicationDeadline = normaliseDate(source.application_deadline);
    if (applicationDeadline && applicationDeadline < asOfDate) {
      held.push({ candidate, reason: 'application_deadline_passed', application_deadline: applicationDeadline, as_of_date: asOfDate });
      continue;
    }

    let fetched;
    try {
      fetched = await options.fetchPage(candidate);
    } catch (error) {
      held.push({ candidate, reason: 'fetch_failed', error: String(error?.message || error) });
      continue;
    }

    const sourceEventDate = normaliseDate(source.event_start);
    const sourceEventYear = sourceEventDate.slice(0, 4);
    const liveText = `${fetched?.title || ''}\n${fetched?.text || fetched?.body || ''}`;
    const liveApplicationYears = explicitApplicationYears(liveText);
    if (sourceEventYear && liveApplicationYears.length && !liveApplicationYears.includes(sourceEventYear)) {
      held.push({
        candidate,
        reason: 'live_application_year_mismatch',
        source_event_year: sourceEventYear,
        live_application_years: liveApplicationYears
      });
      continue;
    }

    const liveApplicationDeadlines = explicitApplicationDeadlines(liveText, sourceEventYear || asOfDate.slice(0, 4));
    if (liveApplicationDeadlines.length && liveApplicationDeadlines.at(-1) < asOfDate) {
      held.push({
        candidate,
        reason: 'application_deadline_passed',
        application_deadline: liveApplicationDeadlines.at(-1),
        as_of_date: asOfDate,
        evidence_source: 'live_page_text'
      });
      continue;
    }

    const liveEventDates = explicitLiveEventDates(liveText, sourceEventYear || asOfDate.slice(0, 4));
    if (source.recurring !== true && sourceEventDate && liveEventDates.length && !liveEventDates.includes(sourceEventDate)) {
      held.push({
        candidate,
        reason: 'live_event_date_mismatch',
        source_event_date: sourceEventDate,
        live_event_dates: liveEventDates
      });
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
      application_deadline: source.application_deadline || fetched?.application_deadline || ''
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

    const extractedDeadline = normaliseDate(result.row.application_deadline);
    if (extractedDeadline && extractedDeadline < asOfDate) {
      held.push({ ...result, candidate, reason: 'application_deadline_passed', application_deadline: extractedDeadline, as_of_date: asOfDate });
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
