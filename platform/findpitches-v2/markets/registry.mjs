const MARKET_DEFINITIONS = {
  GB: {
    code: 'GB',
    name: 'United Kingdom',
    enabled: true,
    locale: 'en-GB',
    language: 'en',
    currency: 'GBP',
    geographyProvider: 'GB',
    search: { gl: 'gb', hl: 'en' },
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
    search: { gl: 'us', hl: 'en' },
    terminology: ['vendor', 'food vendor', 'food truck', 'booth', 'exhibitor'],
    capabilities: {
      states: true,
      provinces: false,
      counties: true,
      postcodes: true,
      multipleLanguages: false
    }
  },
  AU: {
    code: 'AU', name: 'Australia', enabled: true, locale: 'en-AU', language: 'en', currency: 'AUD', geographyProvider: 'AU', search: { gl: 'au', hl: 'en' }, terminology: ['stallholder', 'market stall', 'vendor', 'food vendor', 'exhibitor'], capabilities: { states: true, provinces: false, counties: false, postcodes: true, multipleLanguages: false }
  },
  IE: {
    code: 'IE', name: 'Ireland', enabled: true, locale: 'en-IE', language: 'en', currency: 'EUR', geographyProvider: 'IE', search: { gl: 'ie', hl: 'en' }, terminology: ['trader', 'stallholder', 'vendor', 'food vendor', 'exhibitor'], capabilities: { states: false, provinces: false, counties: true, postcodes: true, multipleLanguages: true }
  },
  NZ: {
    code: 'NZ', name: 'New Zealand', enabled: true, locale: 'en-NZ', language: 'en', currency: 'NZD', geographyProvider: 'NZ', search: { gl: 'nz', hl: 'en' }, terminology: ['stallholder', 'market stall', 'vendor', 'food vendor', 'exhibitor'], capabilities: { states: false, provinces: false, counties: false, postcodes: true, multipleLanguages: true }
  },
  SG: {
    code: 'SG', name: 'Singapore', enabled: true, locale: 'en-SG', language: 'en', currency: 'SGD', geographyProvider: 'SG', search: { gl: 'sg', hl: 'en' }, terminology: ['vendor', 'booth', 'food vendor', 'exhibitor', 'bazaar vendor'], capabilities: { states: false, provinces: false, counties: false, postcodes: true, multipleLanguages: true }
  },
  HK: {
    code: 'HK', name: 'Hong Kong', enabled: true, locale: 'en-HK', language: 'en', currency: 'HKD', geographyProvider: 'HK', search: { gl: 'hk', hl: 'en' }, terminology: ['vendor', 'booth', 'food vendor', 'exhibitor', 'market stall'], capabilities: { states: false, provinces: false, counties: false, postcodes: false, multipleLanguages: true }
  },
  CA: {
    code: 'CA',
    name: 'Canada',
    enabled: true,
    locale: 'en-CA',
    language: 'en',
    currency: 'CAD',
    geographyProvider: 'CA',
    search: { gl: 'ca', hl: 'en' },
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
        search: Object.freeze({ ...market.search }),
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
