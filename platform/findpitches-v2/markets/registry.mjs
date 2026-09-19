const MARKET_DEFINITIONS = {
  GB: {
    code: 'GB',
    name: 'United Kingdom',
    enabled: true,
    locale: 'en-GB',
    language: 'en',
    currency: 'GBP',
    geographyProvider: 'GB',
    terminology: ['trader', 'stallholder', 'pitch', 'vendor', 'exhibitor'],
    capabilities: {
      states: false,
      provinces: false,
      counties: true,
      postcodes: true,
      multipleLanguages: false
    }
  },
  US: {
    code: 'US',
    name: 'United States',
    enabled: true,
    locale: 'en-US',
    language: 'en',
    currency: 'USD',
    geographyProvider: 'US',
    terminology: ['vendor', 'food vendor', 'food truck', 'booth', 'exhibitor'],
    capabilities: {
      states: true,
      provinces: false,
      counties: true,
      postcodes: true,
      multipleLanguages: false
    }
  },
  CA: {
    code: 'CA',
    name: 'Canada',
    enabled: true,
    locale: 'en-CA',
    language: 'en',
    currency: 'CAD',
    geographyProvider: 'CA',
    terminology: ['vendor', 'market vendor', 'food vendor', 'exhibitor'],
    capabilities: {
      states: false,
      provinces: true,
      counties: false,
      postcodes: true,
      multipleLanguages: true
    }
  }
};

export const MARKETS = Object.freeze(
  Object.fromEntries(
    Object.entries(MARKET_DEFINITIONS).map(([code, market]) => [
      code,
      Object.freeze({
        ...market,
        terminology: Object.freeze([...market.terminology]),
        capabilities: Object.freeze({ ...market.capabilities })
      })
    ])
  )
);

export function getMarket(code) {
  const normalized = String(code || '').trim().toUpperCase();
  const market = MARKETS[normalized];
  if (!market) throw new Error(`findpitches_v2_market_unknown:${normalized || 'empty'}`);
  return market;
}

export function enabledMarkets() {
  return Object.values(MARKETS).filter(market => market.enabled);
}
