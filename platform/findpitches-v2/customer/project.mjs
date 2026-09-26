import { assessCustomerReadiness } from './readiness.mjs';

export function projectCustomerOpportunity(candidate = {}, enrichment = {}) {
  const geography = object(candidate.geography);
  const projected = Object.freeze({
    id: text(candidate.id ?? candidate.candidate_id),
    market: upper(candidate.market),
    title: text(enrichment.title ?? candidate.event_name),
    organiser: text(enrichment.organiser ?? candidate.organiser),
    region_code: text(enrichment.region_code ?? candidate.region_code ?? geography.region_code),
    location: text(enrichment.location ?? geography.location),
    coordinates: coordinates(enrichment.coordinates),
    event_start: text(enrichment.event_start ?? candidate.event_start),
    event_end: text(enrichment.event_end ?? candidate.event_end),
    application_deadline: text(enrichment.application_deadline ?? candidate.deadline),
    canonical_url: text(candidate.canonical_url),
    application_url: text(candidate.application_url),
    offerings: offeringArray(enrichment.offerings ?? enrichment.sells),
    recurring: typeof enrichment.recurring === 'boolean' ? enrichment.recurring : null,
    description: text(enrichment.description),
    last_checked: text(candidate.last_checked),
    classifier: Object.freeze({
      status: text(candidate.status),
      score: finite(candidate.score)
    })
  });

  return Object.freeze({
    opportunity: projected,
    readiness: assessCustomerReadiness(projected)
  });
}

function text(value) { const v=String(value ?? '').trim(); return v || null; }
function upper(value) { const v=text(value); return v ? v.toUpperCase() : null; }
function finite(value) { const n=Number(value); return Number.isFinite(n) ? n : null; }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function offeringArray(value) {
  if (!Array.isArray(value)) return null;
  return Object.freeze([...new Set(value.map(item => {
    if (typeof item === 'string') {
      const label = text(item);
      return label ? JSON.stringify({ label, kind: null }) : null;
    }
    if (!item || typeof item !== 'object') return null;
    const label = text(item.label ?? item.name);
    if (!label) return null;
    return JSON.stringify({
      label,
      kind: text(item.kind),
      cuisine: text(item.cuisine),
      product: text(item.product)
    });
  }).filter(Boolean))].map(item => Object.freeze(JSON.parse(item))));
}
function coordinates(value) {
  if (value == null) return null;
  return Object.freeze({ lat: Number(value.lat), lng: Number(value.lng) });
}
