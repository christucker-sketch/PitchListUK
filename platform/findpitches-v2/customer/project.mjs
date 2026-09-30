import { classifyVenueEvidence } from '../enrichment/venue-evidence.mjs';
import { assessCustomerReadiness } from './readiness.mjs';

export function projectCustomerOpportunity(candidate = {}, enrichment = {}) {
  // Prefer exact event-venue evidence, then source-backed place/area evidence.
  // Discovery geography and organiser/contact addresses are never customer location evidence.
  const location = sourceBackedLocation(enrichment.location) ?? sourceBackedArea(enrichment.location_area);
  const geography = object(candidate.geography);
  const projected = Object.freeze({
    id: text(candidate.id ?? candidate.candidate_id),
    market: upper(candidate.market),
    title: text(value(enrichment.title) ?? candidate.event_name),
    organiser: text(value(enrichment.organiser) ?? candidate.organiser),
    region_code: text(value(enrichment.region_code) ?? candidate.region_code ?? geography.region_code),
    location: location?.value ?? null,
    location_precision: location?.precision ?? null,
    location_confidence: location?.confidence ?? null,
    coordinates: coordinates(value(enrichment.coordinates)),
    event_start: text(value(enrichment.event_start) ?? candidate.event_start),
    event_end: text(value(enrichment.event_end) ?? candidate.event_end),
    application_deadline: text(value(enrichment.application_deadline) ?? candidate.deadline),
    canonical_url: text(candidate.canonical_url),
    application_url: text(candidate.application_url),
    offerings: offeringArray(value(enrichment.offerings)),
    recurring: typeof value(enrichment.recurring) === 'boolean' ? value(enrichment.recurring) : null,
    description: text(value(enrichment.description)),
    last_checked: text(candidate.last_checked),
    classifier: Object.freeze({
      status: text(candidate.status),
      score: finite(candidate.score)
    })
  });

  return Object.freeze({
    opportunity: projected,
    readiness: assessCustomerReadiness(projected),
    provenance: Object.freeze({ ...enrichmentProvenance(enrichment), ...(location ? {location:location.provenance} : {}) })
  });
}

function sourceBackedLocation(field) {
  if (!field || typeof field !== 'object' || !('value' in field)) return null;
  const name = text(field.value);
  if (!name || /^(?:unknown|tbc|tbd|online|various|multiple locations|to be announced|the venue|the event|the location)$/i.test(name)) return null;
  const check=classifyVenueEvidence(field);
  if (!check.accepted) return null;
  const confidence=finite(field.confidence);
  return {
    value:name,
    precision:'venue',
    confidence,
    provenance:Object.freeze({precision:'venue',evidence:Object.freeze([check.evidence]),confidence})
  };
}
function sourceBackedArea(field) {
  if (!field || typeof field !== 'object' || !('value' in field)) return null;
  const name=text(field.value), precision=String(field.precision||'').trim().toLowerCase();
  if (!name || !['place','area'].includes(precision) ||
      /^(?:unknown|tbc|tbd|online|various|multiple locations|to be announced|the location)$/i.test(name)) return null;
  if (!Array.isArray(field.evidence) || !field.evidence.length) return null;
  for (const item of field.evidence) {
    let url;
    try { url=new URL(String(item?.source||'')); }
    catch { continue; }
    if (!['http:','https:'].includes(url.protocol)) continue;
    const excerpt=String(item?.excerpt||'').replace(/\s+/g,' ').trim();
    if (!excerpt || excerpt.length>500 || !normalizedContains(excerpt,name)) continue;
    if (/\b(?:registered|head|corporate|business|contact|mailing|postal|billing)\s+(?:office|address|location|headquarters|contact)|\b(?:our\s+office|our\s+address|mail\s+to|contact\s+us|registered\s+at)\b/i.test(excerpt)) continue;
    if (!/\b(?:festival|fair|market|event|show|concert|vendor|trader|stallholder|exhibitor|apply|application|held|takes?\s+place|taking\s+place)\b/i.test(excerpt)) continue;
    const confidence=finite(field.confidence);
    const evidence=Object.freeze({source:url.toString(),excerpt});
    return {
      value:name,
      precision,
      confidence,
      provenance:Object.freeze({precision,evidence:Object.freeze([evidence]),confidence})
    };
  }
  return null;
}
function normalizedContains(haystack,needle) {
  const normalize=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  const h=normalize(haystack), n=normalize(needle);
  return n.length>=3 && (' '+h+' ').includes(' '+n+' ');
}
function value(field) {
  if (field && typeof field === 'object' && !Array.isArray(field) && 'value' in field) return field.value;
  return field;
}
function enrichmentProvenance(enrichment) {
  return Object.freeze(Object.fromEntries(Object.entries(enrichment).flatMap(([key, field]) => {
    if (!field || typeof field !== 'object' || Array.isArray(field) || !('value' in field)) return [];
    return [[key, Object.freeze({
      evidence: Array.isArray(field.evidence) ? field.evidence : Object.freeze([]),
      confidence: finite(field.confidence)
    })]];
  })));
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
