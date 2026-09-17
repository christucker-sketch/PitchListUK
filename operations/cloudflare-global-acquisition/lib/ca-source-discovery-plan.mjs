import { enabledCaAcquisitionUnits } from '../../../platform/acquisition/ca-geography.mjs';

const EXCLUDED_SITES = '-site:facebook.com -site:instagram.com -site:youtube.com -site:linkedin.com -site:eventbrite.ca -site:eventbrite.com -site:reddit.com';

export const CA_DISCOVERY_TEMPLATES = Object.freeze([
  Object.freeze({ id: 'vendor_applications_open', query: unit => `"${unit.name}" "vendor applications" market festival 2026 2027` }),
  Object.freeze({ id: 'become_a_vendor', query: unit => `"${unit.name}" "become a vendor" market festival fair 2026 2027` }),
  Object.freeze({ id: 'festival_vendor', query: unit => `"${unit.name}" festival vendor application 2026 2027` }),
  Object.freeze({ id: 'farmers_market', query: unit => `"${unit.name}" farmers market vendor application 2026 2027` }),
  Object.freeze({ id: 'artisan_market', query: unit => `"${unit.name}" artisan craft market vendor application 2026 2027` }),
  Object.freeze({ id: 'food_vendor', query: unit => `"${unit.name}" food vendor application festival market 2026 2027` }),
  Object.freeze({ id: 'holiday_market', query: unit => `"${unit.name}" Christmas holiday market vendor application 2026` }),
  Object.freeze({ id: 'exhibitor_application', query: unit => `"${unit.name}" exhibitor application fair show festival 2026 2027` }),
  Object.freeze({ id: 'public_market', query: unit => `${unit.name} public market food vendor application official` }),
  Object.freeze({ id: 'municipal_market', query: unit => `${unit.name} municipal market vendor application official` })
]);

export const CA_DISCOVERY_PLAN_SIZE = enabledCaAcquisitionUnits().length * CA_DISCOVERY_TEMPLATES.length;

export function canadaDiscoveryQueries(options = {}) {
  const units = options.units?.length ? options.units : enabledCaAcquisitionUnits();
  const templates = options.templates?.length ? options.templates : CA_DISCOVERY_TEMPLATES;
  const offset = Math.max(0, Number(options.offset || 0));
  const limit = Math.min(12, Math.max(1, Number(options.limit || 4)));
  const all = units.flatMap(unit => templates.map(template => Object.freeze({
    country: 'CA',
    region_code: unit.code,
    region: unit.name,
    jurisdiction: unit.jurisdiction,
    template_id: template.id,
    query: `${template.query(unit)} Canada ${EXCLUDED_SITES}`
  })));
  if (!all.length) return [];
  return Array.from({ length: Math.min(limit, all.length) }, (_, index) => all[(offset + index) % all.length]);
}

export function nextCanadaDiscoveryOffset(offset, consumed, planSize = CA_DISCOVERY_PLAN_SIZE) {
  const start = Math.max(0, Number(offset || 0));
  const count = Math.max(0, Number(consumed || 0));
  const size = Number(planSize);
  if (!Number.isInteger(size) || size <= 0) throw new Error('Canada discovery plan size is invalid');
  return (start + count) % size;
}