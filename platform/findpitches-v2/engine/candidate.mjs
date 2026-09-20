import { normalizeGeography } from '../geography/model.mjs';
import { getMarket } from '../markets/registry.mjs';

const STATUSES = new Set([
  'discovered',
  'fetching',
  'validated',
  'held',
  'rejected',
  'duplicate',
  'queued_for_publish',
  'published',
  'publish_failed'
]);

export function normalizeCandidate(input = {}) {
  const market = getMarket(input.market);
  const status = String(input.status || 'discovered').trim();
  if (!STATUSES.has(status)) throw new Error(`findpitches_v2_candidate_status_invalid:${status}`);

  const sourceUrl = canonicalUrl(input.source_url ?? input.sourceUrl);
  if (!sourceUrl) throw new Error('findpitches_v2_candidate_source_url_missing');

  return Object.freeze({
    candidate_id: requiredString(input.candidate_id ?? input.candidateId, 'candidate_id'),
    market: market.code,
    source_url: sourceUrl,
    canonical_url: canonicalUrl(input.canonical_url ?? input.canonicalUrl) || sourceUrl,
    application_url: canonicalUrl(input.application_url ?? input.applicationUrl),
    event_name: nullableString(input.event_name ?? input.eventName),
    organiser: nullableString(input.organiser),
    geography: normalizeGeography({
      ...(input.geography || {}),
      country_code: input.geography?.country_code || market.code
    }),
    event_start: nullableString(input.event_start ?? input.eventStart),
    event_end: nullableString(input.event_end ?? input.eventEnd),
    deadline: nullableString(input.deadline),
    categories: Object.freeze(uniqueStrings(input.categories)),
    evidence: Object.freeze(Array.isArray(input.evidence) ? input.evidence.map(item => Object.freeze({ ...item })) : []),
    score: Number.isFinite(Number(input.score)) ? Number(input.score) : 0,
    status,
    rejection_reason: nullableString(input.rejection_reason ?? input.rejectionReason)
  });
}

export function canonicalUrl(value) {
  const text = nullableString(value);
  if (!text) return null;

  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error('findpitches_v2_candidate_url_invalid');
  }

  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_.+|gclid|fbclid|msclkid|srsltid)$/i.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return url.toString();
}

function requiredString(value, field) {
  const result = nullableString(value);
  if (!result) throw new Error(`findpitches_v2_candidate_${field}_missing`);
  return result;
}

function nullableString(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(value => String(value || '').trim()).filter(Boolean))];
}

export { STATUSES as FINDPITCHES_V2_CANDIDATE_STATUSES };
