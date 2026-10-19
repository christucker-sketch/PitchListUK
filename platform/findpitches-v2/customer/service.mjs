import { normalizeOpportunitySearch, customerMarketCatalog, customerRegionCatalog } from './api-contract.mjs';
import { getCustomerOpportunity, searchCustomerOpportunities } from './store.mjs';
import { assessCustomerReadiness } from './readiness.mjs';
import { hydrateCustomerOpportunity } from './visibility.mjs';

// options.now / options.maxAgeDays drive the read-time visibility policy (see store.mjs).
export function createCustomerApiService(db, options = {}) {
  if (!db?.prepare) throw new Error('findpitches_customer_api_db_missing');
  const clock = () => (typeof options.now === 'function' ? options.now() : options.now instanceof Date ? options.now : new Date());
  const visibility = () => ({ now: clock(), maxAgeDays: options.maxAgeDays });

  return Object.freeze({
    async markets() {
      return Object.freeze({ api_version: 'v1', markets: customerMarketCatalog() });
    },

    async regions(market) {
      return Object.freeze({ api_version: 'v1', market: String(market || '').trim().toUpperCase(), regions: customerRegionCatalog(String(market || '').trim()) });
    },

    async opportunity(id) {
      const row = await getCustomerOpportunity(db, id, visibility());
      if (!row) return null;
      const opportunity = hydrateCustomerOpportunity(row);
      return currentlyReady(opportunity, clock()) ? Object.freeze({ api_version: 'v1', opportunity }) : null;
    },

    async search(input = {}) {
      const query = normalizeOpportunitySearch(input);
      const result = await searchCustomerOpportunities(db, query, visibility());
      const rows = Array.isArray(result?.results) ? result.results : [];
      const now = clock();
      const opportunities = rows.map(hydrateCustomerOpportunity).filter(item => currentlyReady(item, now)).slice(0, query.limit);
      return Object.freeze({
        api_version: 'v1',
        // Echo only the parameters that are actually applied. Radius and cursor are not implemented,
        // so they are not advertised in responses (the HTTP layer rejects them with 400).
        query: Object.freeze({ market: query.market, region_code: query.region_code, q: query.q, offering: query.offering, cuisine: query.cuisine, limit: query.limit }),
        // Number of opportunities in THIS response, not a total of all matches.
        count: opportunities.length,
        opportunities: Object.freeze(opportunities)
      });
    }
  });
}

// Re-applies the customer-ready contract at read time so rule changes (e.g. newly blocked URL
// patterns) and the passage of time take effect without waiting for re-promotion.
function currentlyReady(opportunity, now) {
  return assessCustomerReadiness(opportunity, { now }).ready;
}
