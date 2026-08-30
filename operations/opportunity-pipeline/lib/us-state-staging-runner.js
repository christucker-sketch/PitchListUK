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
  january: '01', jan: '01', february: '02', feb: '02', march: '03', mar: '03', april: '04', apr: '04', may: '05',
  june: '06', jun: '06', july: '07', jul: '07', august: '08', aug: '08', september: '09', sept: '09', sep: '09',
  october: '10', oct: '10', november: '11', nov: '11', december: '12', dec: '12'
});

const NAMED_DATE_RANGE = /\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept?|october|oct|november|nov|december|dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*[-\u2013\u2014]\s*(\d{1,2})(?:st|nd|rd|th)?)?(?:,?\s+(20\d{2}))?\b/gi;

function validNamedDate(year, month, day) {
  const candidate = `${year}-${month}-${String(Number(day)).padStart(2, '0')}`;
  const date = new Date(`${candidate}T00:00:00Z`);
  return normaliseDate(candidate) && !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === candidate
    ? candidate
    : '';
}

function explicitNamedDates(value, defaultYear, sentenceFilter) {
  const dates = new Set();
  const sentences = String(value || '').split(/[.!?\n]+/);
  for (const sentence of sentences) {
    if (!sentenceFilter(sentence)) continue;
    for (const match of sentence.matchAll(NAMED_DATE_RANGE)) {
      const year = match[4] || defaultYear;
      const month = MONTHS[match[1].toLowerCase()];
      const start = validNamedDate(year, month, match[2]);
      const end = match[3] ? validNamedDate(year, month, match[3]) : '';
      if (start) dates.add(start);
      if (end) dates.add(end);
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
    (/\b(?:event|market|festival|fair)\b/i.test(sentence) ||
      /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?\s*[-\u2013\u2014]\s*\d{1,2}(?:st|nd|rd|th)?(?:,?\s+20\d{2})\b/i.test(sentence)) &&
    !/\b(?:applications?|applying|apply)\b[^.]{0,120}\b(?:close[sd]?|closing|deadline|due|through|until|by)\b/i.test(sentence) &&
    !/\b(?:booking|discount|payment|reservation|cancellation|setup|move-in|load-in)\s+(?:close[sd]?|closing|deadline|due|date)\b/i.test(sentence)
  );
}

export function applicationRouteAttestation(source, fetched = {}) {
  const applicationRoute = canonical(source?.application_url);
  const sourceRoute = canonical(source?.source_url);
  if (!applicationRoute) return { attested: false, method: 'missing_application_route' };
  if (applicationRoute === sourceRoute) return { attested: true, method: 'same_as_source' };
  // Offline adapters inject already-reviewed page objects. Production
  // fetchApprovedPage always supplies fetch_route and must pass the live-link gate below.
  if (!fetched?.fetch_route) return { attested: true, method: 'injected_adapter_contract' };
  if (fetched?.fetch_route === 'application_fallback') return { attested: true, method: 'fetched_application_fallback' };
  const liveRoutes = [fetched?.url, ...(Array.isArray(fetched?.links) ? fetched.links.map(link => link?.url) : [])]
    .map(canonical)
    .filter(Boolean);
  return liveRoutes.includes(applicationRoute)
    ? { attested: true, method: 'linked_from_live_source' }
    : { attested: false, method: 'not_linked_from_live_source' };
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

    const routeAttestation = applicationRouteAttestation(source, fetched);
    if (!routeAttestation.attested) {
      held.push({ candidate, reason: 'application_route_not_attested', attestation_method: routeAttestation.method });
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
    const sourceEventEnd = normaliseDate(source.event_end) || sourceEventDate;
    if (fetched?.fetch_route && source.recurring !== true && sourceEventDate && liveEventDates.length === 0) {
      held.push({
        candidate,
        reason: 'live_event_date_unattested',
        source_event_date: sourceEventDate,
        source_event_end: sourceEventEnd
      });
      continue;
    }
    if (source.recurring !== true && sourceEventDate && liveEventDates.length &&
        (!liveEventDates.includes(sourceEventDate) || (sourceEventEnd && !liveEventDates.includes(sourceEventEnd)))) {
      held.push({
        candidate,
        reason: 'live_event_date_mismatch',
        source_event_date: sourceEventDate,
        source_event_end: sourceEventEnd,
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
    result.evidence_receipt = {
      source_id: source.id,
      application_route_attested: true,
      attestation_method: routeAttestation.method,
      fetch_route: fetched?.fetch_route || 'injected',
      live_application_years: liveApplicationYears,
      live_event_dates: liveEventDates,
      live_application_deadlines: liveApplicationDeadlines
    };
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
    duplicates,
    evidence_receipts: unique.map(result => result.evidence_receipt)
  };

  return buildStateStagingManifest(state, report, {
    runId: options.runId,
    generatedAt: options.generatedAt,
    sourceCount: sources.length
  });
}
