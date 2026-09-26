// Evidence-led enrichment contract for customer-facing FindPitches data.
// Enrichment remains separate from acquisition and classification.

export const ENRICHMENT_SCHEMA_VERSION = '2026-09-26.1';

export function normalizeEnrichment(input = {}) {
  return Object.freeze({
    organiser: field(input.organiser),
    location: field(input.location),
    coordinates: coordinateField(input.coordinates),
    event_start: field(input.event_start),
    event_end: field(input.event_end),
    application_deadline: field(input.application_deadline),
    offerings: offeringsField(input.offerings),
    recurring: booleanField(input.recurring),
    description: field(input.description)
  });
}

function field(value) {
  if (value == null) return null;
  if (typeof value === 'object' && !Array.isArray(value) && ('value' in value || 'evidence' in value)) {
    const normalized = scalar(value.value);
    return normalized == null ? null : Object.freeze({
      value: normalized,
      evidence: evidenceArray(value.evidence),
      confidence: confidence(value.confidence)
    });
  }
  const normalized = scalar(value);
  return normalized == null ? null : Object.freeze({ value: normalized, evidence: Object.freeze([]), confidence: null });
}

function coordinateField(value) {
  if (value == null) return null;
  const raw = value?.value ?? value;
  const lat = Number(raw?.lat);
  const lng = Number(raw?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return Object.freeze({
    value: Object.freeze({ lat, lng }),
    evidence: evidenceArray(value?.evidence),
    confidence: confidence(value?.confidence)
  });
}

function offeringsField(value) {
  if (value == null) return null;
  const raw = value?.value ?? value;
  if (!Array.isArray(raw)) return null;
  const offerings = raw.map(item => {
    if (typeof item === 'string') return { label: scalar(item), kind: null, cuisine: null, product: null };
    if (!item || typeof item !== 'object') return null;
    return {
      label: scalar(item.label ?? item.name),
      kind: scalar(item.kind),
      cuisine: scalar(item.cuisine),
      product: scalar(item.product)
    };
  }).filter(item => item?.label).map(Object.freeze);
  return Object.freeze({
    value: Object.freeze(offerings),
    evidence: evidenceArray(value?.evidence),
    confidence: confidence(value?.confidence)
  });
}

function booleanField(value) {
  if (value == null) return null;
  const raw = value?.value ?? value;
  if (typeof raw !== 'boolean') return null;
  return Object.freeze({ value: raw, evidence: evidenceArray(value?.evidence), confidence: confidence(value?.confidence) });
}

function evidenceArray(value) {
  if (!Array.isArray(value)) return Object.freeze([]);
  return Object.freeze(value.map(item => {
    if (typeof item === 'string') return Object.freeze({ source: item, excerpt: null });
    if (!item || typeof item !== 'object') return null;
    return Object.freeze({ source: scalar(item.source ?? item.url), excerpt: scalar(item.excerpt) });
  }).filter(Boolean));
}

function confidence(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
}

function scalar(value) { const text=String(value ?? '').trim(); return text || null; }
