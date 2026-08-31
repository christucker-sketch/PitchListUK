const ACTIVE = 'active';
const PLANNED = 'planned';

export const countryRegistry = Object.freeze({
  us: Object.freeze({
    code: 'us',
    name: 'United States',
    status: ACTIVE,
    canonicalPath: '/us/',
    locale: 'en-US',
    currency: 'USD',
    dateFormat: 'MM/DD/YYYY',
    postal: Object.freeze({ label: 'ZIP Code', kind: 'zip' }),
    region: Object.freeze({ singular: 'state', plural: 'states' }),
    acquisitionTerms: Object.freeze(['vendor', 'concession', 'food truck', 'booth', 'exhibitor', 'market vendor']),
    searchTerms: Object.freeze(['vendor opportunities', 'fairs', 'festivals', 'markets', 'food trucks', 'pop-ups', 'concessions'])
  }),
  uk: Object.freeze({
    code: 'uk',
    name: 'United Kingdom',
    status: ACTIVE,
    canonicalPath: '/uk/',
    locale: 'en-GB',
    currency: 'GBP',
    dateFormat: 'DD/MM/YYYY',
    postal: Object.freeze({ label: 'Postcode', kind: 'postcode' }),
    region: Object.freeze({ singular: 'region', plural: 'regions' }),
    acquisitionTerms: Object.freeze(['trader', 'stallholder', 'pitch', 'market stall', 'exhibitor', 'food trader']),
    searchTerms: Object.freeze(['trading pitches', 'markets', 'fairs', 'festivals', 'shows', 'street food'])
  }),
  ca: Object.freeze({
    code: 'ca',
    name: 'Canada',
    status: PLANNED,
    canonicalPath: '/ca/',
    locale: 'en-CA',
    currency: 'CAD',
    dateFormat: 'YYYY-MM-DD',
    postal: Object.freeze({ label: 'Postal Code', kind: 'postal-code' }),
    region: Object.freeze({ singular: 'province or territory', plural: 'provinces and territories' }),
    acquisitionTerms: Object.freeze(['vendor', 'market vendor', 'exhibitor', 'food vendor', 'booth']),
    searchTerms: Object.freeze(['vendor opportunities', 'markets', 'fairs', 'festivals', 'food vendors'])
  }),
  au: Object.freeze({
    code: 'au',
    name: 'Australia',
    status: PLANNED,
    canonicalPath: '/au/',
    locale: 'en-AU',
    currency: 'AUD',
    dateFormat: 'DD/MM/YYYY',
    postal: Object.freeze({ label: 'Postcode', kind: 'postcode' }),
    region: Object.freeze({ singular: 'state or territory', plural: 'states and territories' }),
    acquisitionTerms: Object.freeze(['stallholder', 'vendor', 'market stall', 'food vendor', 'exhibitor']),
    searchTerms: Object.freeze(['market stalls', 'vendor opportunities', 'markets', 'fairs', 'festivals'])
  }),
  nz: Object.freeze({
    code: 'nz',
    name: 'New Zealand',
    status: PLANNED,
    canonicalPath: '/nz/',
    locale: 'en-NZ',
    currency: 'NZD',
    dateFormat: 'DD/MM/YYYY',
    postal: Object.freeze({ label: 'Postcode', kind: 'postcode' }),
    region: Object.freeze({ singular: 'region', plural: 'regions' }),
    acquisitionTerms: Object.freeze(['stallholder', 'vendor', 'market stall', 'food vendor', 'exhibitor']),
    searchTerms: Object.freeze(['market stalls', 'vendor opportunities', 'markets', 'fairs', 'festivals'])
  }),
  ie: Object.freeze({
    code: 'ie',
    name: 'Ireland',
    status: PLANNED,
    canonicalPath: '/ie/',
    locale: 'en-IE',
    currency: 'EUR',
    dateFormat: 'DD/MM/YYYY',
    postal: Object.freeze({ label: 'Eircode', kind: 'eircode' }),
    region: Object.freeze({ singular: 'county', plural: 'counties' }),
    acquisitionTerms: Object.freeze(['trader', 'stallholder', 'vendor', 'market stall', 'exhibitor']),
    searchTerms: Object.freeze(['trading pitches', 'markets', 'fairs', 'festivals', 'food vendors'])
  })
});

export function getCountry(code) {
  if (!code) return null;
  return countryRegistry[String(code).trim().toLowerCase()] ?? null;
}

export function listCountries({ status } = {}) {
  const countries = Object.values(countryRegistry);
  return status ? countries.filter(country => country.status === status) : countries;
}

export function listActiveCountries() {
  return listCountries({ status: ACTIVE });
}

export function isSupportedCountry(code) {
  return Boolean(getCountry(code));
}
