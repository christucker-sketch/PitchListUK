import { FLORIDA_SOURCES as BASE_FLORIDA_SOURCES } from './florida-source-registry.js';

const ROUTE_OVERRIDES = Object.freeze({
  'fl-wesley-chapel-fall-festival-2026': 'https://lp.constantcontactpages.com/ev/reg/zvqdkf2',
  'fl-ocala-wellness-expo-2026': 'https://lp.constantcontactpages.com/ev/reg/z4uqv3e',
  'fl-wesley-chapel-harvest-markets-2026': 'https://lp.constantcontactpages.com/ev/reg/t4f2vnz',
  'fl-market-elaine-wesley-chapel-2026-27': 'https://themarketculture.com/the-market-elaine-application-form/',
  'fl-market-marie-clearwater-2026-27': 'https://themarketculture.com/the-market-marie-vendor-application-2/'
});

export const FLORIDA_SOURCES = Object.freeze(BASE_FLORIDA_SOURCES.map(source => {
  const route = ROUTE_OVERRIDES[source.id];
  return Object.freeze(route ? { ...source, source_url: route, application_url: route } : source);
}));
