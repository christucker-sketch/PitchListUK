import { getCaAcquisitionUnit } from '../../../platform/acquisition/ca-geography.mjs';

const PUBLIC_SERVICE_ROOTS = Object.freeze([
  'canada.ca', 'gc.ca', 'alberta.ca', 'gov.bc.ca', 'ontario.ca', 'quebec.ca', 'saskatchewan.ca',
  'manitoba.ca', 'gnb.ca', 'novascotia.ca', 'gov.nl.ca', 'princeedwardisland.ca', 'gov.nt.ca',
  'gov.nu.ca', 'yukon.ca'
]);

const VENDOR_SIGNAL = /\b(vendor|vendors|exhibitor|exhibitors|booth|booths|concession|concessions|food truck|food trucks|market vendor|market vendors|artisan|artisans)\b/i;
const ACTION_SIGNAL = /\b(apply|application|applications|register|registration|book|booking|submit|form|deadline|fees?|rates?)\b/i;
const NEGATIVE_SIGNAL = /\b(closed to vendors|applications? closed|no vendors?|not accepting vendors?|cancelled|canceled)\b/i;

function normalise(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
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

  const text = [candidate.title, candidate.snippet, candidate.page_text, candidate.location, candidate.region, candidate.province]
    .filter(Boolean).join(' ');
  const normalized = normalise(text);
  const regionSignals = [unit.name, unit.code, unit.jurisdiction, ...(unit.aliases || [])].map(normalise).filter(Boolean);
  if (!regionSignals.some(signal => normalized.includes(signal))) {
    return Object.freeze({ status: 'held', reason: 'canada_region_not_attested', region_code: unit.code });
  }
  if (NEGATIVE_SIGNAL.test(text)) return Object.freeze({ status: 'held', reason: 'canada_negative_vendor_signal', region_code: unit.code });
  if (!VENDOR_SIGNAL.test(text)) return Object.freeze({ status: 'held', reason: 'canada_vendor_signal_missing', region_code: unit.code });
  if (!ACTION_SIGNAL.test(text)) return Object.freeze({ status: 'held', reason: 'canada_action_signal_missing', region_code: unit.code });

  const publicService = isCanadianPublicServiceHost(sourceUrl) && isCanadianPublicServiceHost(applicationUrl);
  if (!publicService) {
    return Object.freeze({
      status: 'review',
      reason: 'canada_non_public_service_requires_review',
      region_code: unit.code,
      jurisdiction: unit.jurisdiction
    });
  }

  return Object.freeze({
    status: 'approved',
    reason: 'canada_public_service_first_party_evidence',
    region_code: unit.code,
    region_name: unit.name,
    jurisdiction: unit.jurisdiction,
    source_url: sourceUrl,
    application_url: applicationUrl
  });
}

export { PUBLIC_SERVICE_ROOTS };
