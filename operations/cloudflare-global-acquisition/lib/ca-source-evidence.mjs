import { getCaAcquisitionUnit } from '../../../platform/acquisition/ca-geography.mjs';

const FEDERAL_PROVINCIAL_PUBLIC_SERVICE_ROOTS = Object.freeze([
  'canada.ca', 'gc.ca', 'alberta.ca', 'gov.bc.ca', 'ontario.ca', 'quebec.ca', 'saskatchewan.ca',
  'manitoba.ca', 'gnb.ca', 'novascotia.ca', 'gov.nl.ca', 'princeedwardisland.ca', 'gov.nt.ca',
  'gov.nu.ca', 'yukon.ca'
]);

const MUNICIPAL_PUBLIC_SERVICE_ROOTS = Object.freeze([
  'toronto.ca', 'ottawa.ca', 'vancouver.ca', 'calgary.ca', 'edmonton.ca', 'winnipeg.ca',
  'moncton.ca', 'halifax.ca', 'montreal.ca', 'saskatoon.ca', 'regina.ca', 'whitehorse.ca',
  'yellowknife.ca'
]);

const PUBLIC_SERVICE_ROOTS = Object.freeze([
  ...FEDERAL_PROVINCIAL_PUBLIC_SERVICE_ROOTS,
  ...MUNICIPAL_PUBLIC_SERVICE_ROOTS
]);

const NON_FIRST_PARTY_ROOTS = Object.freeze([
  'facebook.com', 'instagram.com', 'youtube.com', 'youtu.be', 'linkedin.com', 'tiktok.com',
  'x.com', 'twitter.com', 'reddit.com', 'eventbrite.com', 'eventbrite.ca', '10times.com',
  'allevents.in', 'festivalnet.com'
]);

const VENDOR_SIGNAL = /\b(vendor|vendors|exhibitor|exhibitors|booth|booths|concession|concessions|food truck|food trucks|market vendor|market vendors|artisan|artisans|merchant|merchants)\b/i;
const ACTION_SIGNAL = /\b(apply|application|applications|register|registration|book|booking|submit|form|deadline|fees?|rates?|become a vendor|vendor applications? open)\b/i;
const OPPORTUNITY_SIGNAL = /\b(market|festival|fair|show|event|holiday market|christmas market|farmers? market|artisan market)\b/i;
const NEGATIVE_SIGNAL = /\b(closed to vendors|applications? closed|no vendors?|not accepting vendors?|cancelled|canceled)\b/i;

function normalise(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function containsPhrase(haystack, phrase) {
  const haystackTokens = normalise(haystack).split(' ').filter(Boolean);
  const phraseTokens = normalise(phrase).split(' ').filter(Boolean);
  if (!phraseTokens.length || phraseTokens.length > haystackTokens.length) return false;
  return haystackTokens.some((_, index) => phraseTokens.every((token, offset) => haystackTokens[index + offset] === token));
}

function hostOf(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return '';
    return url.hostname.toLowerCase().replace(/^www\./, '');
  } catch { return ''; }
}

function hostWithin(host, root) {
  return host === root || host.endsWith(`.${root}`);
}

function registrableComparableHost(host) {
  const parts = String(host || '').split('.').filter(Boolean);
  if (parts.length <= 2) return parts.join('.');
  const twoLevelCountrySuffix = /\.(?:co|com|org|net|gov)\.[a-z]{2}$/i.test(host);
  return parts.slice(twoLevelCountrySuffix ? -3 : -2).join('.');
}

function sameFirstPartyHost(left, right) {
  const a = hostOf(left);
  const b = hostOf(right);
  return Boolean(a && b && registrableComparableHost(a) === registrableComparableHost(b));
}

function isExcludedFirstParty(value) {
  const host = hostOf(value);
  return Boolean(host && NON_FIRST_PARTY_ROOTS.some(root => hostWithin(host, root)));
}

export function isCanadianPublicServiceHost(value) {
  const host = hostOf(value);
  return Boolean(host && PUBLIC_SERVICE_ROOTS.some(root => hostWithin(host, root)));
}

export function evaluateCanadaSourceEvidence(candidate = {}) {
  const unit = getCaAcquisitionUnit(candidate.region_code || candidate.province_code || candidate.jurisdiction);
  if (!unit) return Object.freeze({ status: 'held', reason: 'canada_region_not_attested' });

  const sourceUrl = String(candidate.source_url || candidate.url || '');
  const applicationUrl = String(candidate.application_url || sourceUrl);
  if (!hostOf(sourceUrl) || !hostOf(applicationUrl)) return Object.freeze({ status: 'held', reason: 'canada_source_url_invalid' });
  if (isExcludedFirstParty(sourceUrl) || isExcludedFirstParty(applicationUrl)) {
    return Object.freeze({ status: 'held', reason: 'canada_non_first_party_platform_rejected', region_code: unit.code });
  }

  const text = [candidate.title, candidate.snippet, candidate.page_text, candidate.location, candidate.region, candidate.province]
    .filter(Boolean).join(' ');
  const unitCode = normalise(unit.code);
  const regionSignals = [unit.name, unit.jurisdiction, ...(unit.aliases || [])]
    .filter(signal => normalise(signal) !== unitCode);
  if (!regionSignals.some(signal => containsPhrase(text, signal))) {
    return Object.freeze({ status: 'held', reason: 'canada_region_not_attested', region_code: unit.code });
  }
  if (NEGATIVE_SIGNAL.test(text)) return Object.freeze({ status: 'held', reason: 'canada_negative_vendor_signal', region_code: unit.code });
  if (!VENDOR_SIGNAL.test(text)) return Object.freeze({ status: 'held', reason: 'canada_vendor_signal_missing', region_code: unit.code });
  if (!ACTION_SIGNAL.test(text)) return Object.freeze({ status: 'held', reason: 'canada_action_signal_missing', region_code: unit.code });
  if (!OPPORTUNITY_SIGNAL.test(text)) return Object.freeze({ status: 'held', reason: 'canada_opportunity_context_missing', region_code: unit.code });

  const publicService = isCanadianPublicServiceHost(sourceUrl) && isCanadianPublicServiceHost(applicationUrl);
  if (publicService) {
    return Object.freeze({
      status: 'approved',
      reason: 'canada_public_service_first_party_evidence',
      source_class: 'public-service',
      region_code: unit.code,
      region_name: unit.name,
      jurisdiction: unit.jurisdiction,
      source_url: sourceUrl,
      application_url: applicationUrl
    });
  }

  if (sameFirstPartyHost(sourceUrl, applicationUrl)) {
    return Object.freeze({
      status: 'approved',
      reason: 'canada_deterministic_first_party_organiser_evidence',
      source_class: 'event-organiser',
      region_code: unit.code,
      region_name: unit.name,
      jurisdiction: unit.jurisdiction,
      source_url: sourceUrl,
      application_url: applicationUrl
    });
  }

  return Object.freeze({
    status: 'review',
    reason: 'canada_cross_host_application_requires_review',
    source_class: 'event-organiser',
    region_code: unit.code,
    region_name: unit.name,
    jurisdiction: unit.jurisdiction
  });
}

export {
  FEDERAL_PROVINCIAL_PUBLIC_SERVICE_ROOTS,
  MUNICIPAL_PUBLIC_SERVICE_ROOTS,
  PUBLIC_SERVICE_ROOTS,
  NON_FIRST_PARTY_ROOTS,
  sameFirstPartyHost
};