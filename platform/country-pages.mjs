import { getCountry } from './countries.mjs';
import { buildCountryNavigation } from './web-shell.mjs';

export const COUNTRY_PAGE_MODULES = Object.freeze({
  us: Object.freeze({
    code: 'us',
    sourceRoot: 'src/us',
    homepage: 'src/us/index.html',
    searchPage: 'src/us/find-pitches.html',
    canonicalBase: '/us/',
    legacyHost: null,
    migrationState: 'shared-shell-live'
  }),
  uk: Object.freeze({
    code: 'uk',
    sourceRoot: 'src',
    homepage: 'src/index.html',
    searchPage: 'src/database.html',
    canonicalBase: '/uk/',
    legacyHost: 'pitchlist.uk',
    migrationState: 'legacy-live-ready-for-shared-shell'
  })
});

export function getCountryPageModule(code) {
  const key = String(code || '').toLowerCase();
  const module = COUNTRY_PAGE_MODULES[key];
  if (!module) return null;
  const country = getCountry(key);
  return Object.freeze({
    ...module,
    country,
    navigation: buildCountryNavigation(key)
  });
}

export function listCountryPageModules() {
  return Object.keys(COUNTRY_PAGE_MODULES).map(getCountryPageModule);
}
