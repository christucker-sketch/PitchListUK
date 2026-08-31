import { getCountry, listActiveCountries } from './countries.mjs';

export const GLOBAL_NAV = Object.freeze([
  Object.freeze({ key: 'find', label: 'Find Opportunities', path: 'find-pitches' }),
  Object.freeze({ key: 'how', label: 'How It Works', anchor: 'how-it-works' }),
  Object.freeze({ key: 'categories', label: 'Categories', anchor: 'categories' }),
  Object.freeze({ key: 'about', label: 'About', anchor: 'about' })
]);

export const GLOBAL_CATEGORIES = Object.freeze([
  Object.freeze({ key: 'fairs', label: 'Fairs', asset: '/assets/card-county-show.jpg' }),
  Object.freeze({ key: 'festivals', label: 'Festivals', asset: '/assets/card-festival-vendors.jpg' }),
  Object.freeze({ key: 'markets', label: 'Markets', asset: '/assets/card-farmers-market.jpg' }),
  Object.freeze({ key: 'food', label: 'Food Trucks', asset: '/assets/card-food-truck-pitches.jpg' }),
  Object.freeze({ key: 'popups', label: 'Pop-ups', asset: '/assets/card-night-market.jpg' }),
  Object.freeze({ key: 'concessions', label: 'Concessions', asset: '/assets/card-shows-festivals.jpg' })
]);

export function countryBasePath(code) {
  const country = getCountry(code);
  if (!country) return null;
  return country.canonicalPath.replace(/\/$/, '');
}

export function countryPath(code, route = '') {
  const base = countryBasePath(code);
  if (!base) return null;
  const clean = String(route || '').replace(/^\/+|\/+$/g, '');
  return clean ? `${base}/${clean}` : `${base}/`;
}

export function buildCountryNavigation(code) {
  const country = getCountry(code);
  if (!country) return null;
  return Object.freeze({
    country,
    home: countryPath(code),
    items: GLOBAL_NAV.map(item => Object.freeze({
      ...item,
      href: item.path ? countryPath(code, item.path) : `${countryPath(code)}#${item.anchor}`
    }))
  });
}

export function buildCountrySelector({ includePlanned = false } = {}) {
  const countries = includePlanned ? ['us', 'uk', 'ca', 'au', 'nz', 'ie'].map(getCountry) : listActiveCountries();
  return countries.filter(Boolean).map(country => Object.freeze({
    code: country.code,
    name: country.name,
    href: countryPath(country.code),
    status: country.status
  }));
}
