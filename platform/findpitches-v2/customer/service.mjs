import { normalizeOpportunitySearch, customerMarketCatalog, customerRegionCatalog } from './api-contract.mjs';
import { getCustomerOpportunity, searchCustomerOpportunities } from './store.mjs';

export function createCustomerApiService(db) {
  if (!db?.prepare) throw new Error('findpitches_customer_api_db_missing');

  return Object.freeze({
    async markets() {
      return Object.freeze({ api_version: 'v1', markets: customerMarketCatalog() });
    },

    async regions(market) {
      return Object.freeze({ api_version: 'v1', market: String(market || '').toUpperCase(), regions: customerRegionCatalog(market) });
    },

    async opportunity(id) {
      const row = await getCustomerOpportunity(db, id);
      return row ? Object.freeze({ api_version: 'v1', opportunity: hydrate(row) }) : null;
    },

    async search(input = {}) {
      const query = normalizeOpportunitySearch(input);
      const result = await searchCustomerOpportunities(db, query);
      const rows = Array.isArray(result?.results) ? result.results : [];
      return Object.freeze({
        api_version: 'v1',
        query,
        count: rows.length,
        opportunities: Object.freeze(rows.map(hydrate))
      });
    }
  });
}

function hydrate(row) {
  return Object.freeze({
    id: row.id,
    market: row.market,
    region_code: row.region_code,
    title: row.title,
    organiser: row.organiser ?? null,
    location: row.location ?? null,
    coordinates: parse(row.coordinates_json),
    event_start: row.event_start ?? null,
    event_end: row.event_end ?? null,
    application_deadline: row.application_deadline ?? null,
    canonical_url: row.canonical_url,
    application_url: row.application_url,
    offerings: parse(row.offerings_json),
    recurring: row.recurring == null ? null : Boolean(row.recurring),
    description: row.description ?? null,
    last_checked: row.last_checked
  });
}

function parse(value) {
  if (value == null || value === '') return null;
  try { return JSON.parse(value); } catch { return null; }
}
