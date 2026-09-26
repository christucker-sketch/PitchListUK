import { enabledMarkets } from '../markets/registry.mjs';
import { enabledGeographies } from '../geography/catalog.mjs';

export const CUSTOMER_API_VERSION = 'v1';

export function customerMarketCatalog() {
  return Object.freeze(enabledMarkets().map(market => Object.freeze({
    code: market.code,
    name: market.name,
    locale: market.locale,
    currency: market.currency,
    capabilities: market.capabilities
  })));
}

export function customerRegionCatalog(market) {
  return Object.freeze(enabledGeographies(market).map(region => Object.freeze({
    code: region.code,
    market: region.market,
    name: region.name
  })));
}

export function normalizeOpportunitySearch(input = {}) {
  const market = upper(input.market);
  const region = text(input.region_code ?? input.region);
  const q = text(input.q ?? input.query);
  const offering = text(input.offering);
  const cuisine = text(input.cuisine);
  const lat = finite(input.lat);
  const lng = finite(input.lng);
  const radiusKm = finite(input.radius_km ?? input.radiusKm);
  const limit = boundedInt(input.limit, 1, 100, 25);
  const cursor = text(input.cursor);

  if (market && !customerMarketCatalog().some(item => item.code === market)) {
    throw new Error(`findpitches_customer_api_market_unknown:${market}`);
  }
  if ((lat == null) !== (lng == null)) throw new Error('findpitches_customer_api_coordinates_incomplete');
  if (radiusKm != null && (lat == null || lng == null)) throw new Error('findpitches_customer_api_radius_without_coordinates');
  if (lat != null && (lat < -90 || lat > 90 || lng < -180 || lng > 180)) throw new Error('findpitches_customer_api_coordinates_invalid');
  if (radiusKm != null && (radiusKm <= 0 || radiusKm > 1000)) throw new Error('findpitches_customer_api_radius_invalid');

  return Object.freeze({ market, region_code: region, q, offering, cuisine, lat, lng, radius_km: radiusKm, limit, cursor });
}

function text(value) { const v=String(value ?? '').trim(); return v || null; }
function upper(value) { const v=text(value); return v ? v.toUpperCase() : null; }
function finite(value) { if (value === '' || value == null) return null; const n=Number(value); return Number.isFinite(n) ? n : null; }
function boundedInt(value,min,max,fallback) { const n=Math.trunc(Number(value)); return Number.isFinite(n) ? Math.max(min,Math.min(max,n)) : fallback; }
