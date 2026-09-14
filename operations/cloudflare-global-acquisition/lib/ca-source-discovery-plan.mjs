import { enabledCaAcquisitionUnits } from '../../../platform/acquisition/ca-geography.mjs';

const EXCLUDED_SITES = '-site:facebook.com -site:instagram.com -site:youtube.com -site:linkedin.com -site:eventbrite.ca -site:eventbrite.com';

export const CA_DISCOVERY_TEMPLATES = Object.freeze([
  Object.freeze({ id: 'public_market', query: unit => `${unit.name} public market food vendor permit application official` }),
  Object.freeze({ id: 'temporary_food_event', query: unit => `${unit.name} temporary food event vendor permit application official` }),
  Object.freeze({ id: 'special_event_vendor', query: unit => `${unit.name} special event vendor licence permit application official` }),
  Object.freeze({ id: 'farmers_market', query: unit => `${unit.name} farmers market vendor application official` }),
  Object.freeze({ id: 'municipal_market', query: unit => `${unit.name} municipal market vendor application official` }),
  Object.freeze({ id: 'festival_vendor', query: unit => `${unit.name} festival vendor application official` }),
  Object.freeze({ id: 'food_vendor', query: unit => `${unit.name} food vendor concession permit application official` }),
  Object.freeze({ id: 'mobile_food_vendor', query: unit => `${unit.name} mobile food vendor food truck permit application official` })
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
