export const QUERY_TEMPLATES = Object.freeze([
  Object.freeze({ id: 'wanted', template: '"{term} wanted" {location}', category: 'general', weight: 100 }),
  Object.freeze({ id: 'application', template: '"{term} application" {location}', category: 'general', weight: 100 }),
  Object.freeze({ id: 'apply-to-trade', template: '"apply to trade" {location}', category: 'general', weight: 110 }),
  Object.freeze({ id: 'become-vendor', template: '"become a vendor" {location}', category: 'general', weight: 100 }),
  Object.freeze({ id: 'food', template: '"food vendor application" {location}', category: 'food', weight: 100 }),
  Object.freeze({ id: 'market', template: '"market vendor application" {location}', category: 'market', weight: 100 }),
  Object.freeze({ id: 'exhibitor', template: '"exhibitor application" {location}', category: 'event', weight: 90 })
]);

export function buildQueries({ market, location, limit = 8, rotation = 0 }) {
  if (!market?.terminology?.length) throw new Error('findpitches_v2_query_market_terms_missing');
  const place = String(location || '').trim();
  if (!place) throw new Error('findpitches_v2_query_location_missing');

  const queries = [];
  for (const template of QUERY_TEMPLATES) {
    const terms = template.template.includes('{term}') ? market.terminology : [''];
    for (const term of terms) {
      queries.push(Object.freeze({
        template_id: template.id,
        category: template.category,
        weight: template.weight,
        query: template.template
          .replace('{term}', term)
          .replace('{location}', place)
          .replace(/\s+/g, ' ')
          .trim()
      }));
    }
  }

  const ordered = queries.sort((a, b) => b.weight - a.weight || a.query.localeCompare(b.query));
  const take = Math.min(ordered.length, Math.max(1, Number(limit) || 8));
  const start = ordered.length ? Math.abs(Number(rotation) || 0) % ordered.length : 0;
  return Object.freeze(Array.from({ length: take }, (_, index) => ordered[(start + index) % ordered.length]));
}
