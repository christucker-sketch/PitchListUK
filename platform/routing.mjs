import { getCountry } from './countries.mjs';

const FINDPITCHES_HOSTS = new Set(['findpitches.com', 'www.findpitches.com']);
const LEGACY_COUNTRY_HOSTS = new Map([
  ['pitchlist.uk', 'uk'],
  ['www.pitchlist.uk', 'uk']
]);

function normalizeHostname(hostname) {
  return String(hostname || '').trim().toLowerCase().replace(/:\d+$/, '');
}

function normalizePathname(pathname) {
  const raw = String(pathname || '/').trim() || '/';
  return raw.startsWith('/') ? raw : `/${raw}`;
}

export function isFindPitchesHost(hostname) {
  return FINDPITCHES_HOSTS.has(normalizeHostname(hostname));
}

export function legacyCountryForHost(hostname) {
  const code = LEGACY_COUNTRY_HOSTS.get(normalizeHostname(hostname));
  return code ? getCountry(code) : null;
}

export function countryCodeFromPath(pathname) {
  const path = normalizePathname(pathname);
  const match = path.match(/^\/([a-z]{2})(?:\/|$)/i);
  if (!match) return null;
  const country = getCountry(match[1]);
  return country?.code ?? null;
}

export function resolveCountryRequest({ hostname, pathname = '/' } = {}) {
  const host = normalizeHostname(hostname);
  const path = normalizePathname(pathname);

  if (FINDPITCHES_HOSTS.has(host)) {
    const pathCountryCode = countryCodeFromPath(path);
    if (pathCountryCode) {
      return Object.freeze({
        country: getCountry(pathCountryCode),
        source: 'path',
        hostname: host,
        pathname: path
      });
    }

    return Object.freeze({
      country: null,
      source: 'global',
      hostname: host,
      pathname: path
    });
  }

  const legacyCountry = legacyCountryForHost(host);
  if (legacyCountry) {
    return Object.freeze({
      country: legacyCountry,
      source: 'legacy-host',
      hostname: host,
      pathname: path
    });
  }

  return null;
}

export function countryPublicPath(code, suffix = '/') {
  const country = getCountry(code);
  if (!country) return null;
  const cleanSuffix = normalizePathname(suffix).replace(/^\/+/, '');
  return cleanSuffix ? `${country.canonicalPath}${cleanSuffix}` : country.canonicalPath;
}
