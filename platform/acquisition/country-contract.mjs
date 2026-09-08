import { getCountry, listCountries } from '../countries.mjs';

const ALIASES = Object.freeze({
  GB: 'UK',
  GBR: 'UK',
  USA: 'US',
  CAN: 'CA',
  AUS: 'AU',
  NZL: 'NZ',
  IRL: 'IE'
});

export function normalizeAcquisitionCountry(value) {
  const raw = String(value || '').trim().toUpperCase();
  const country = ALIASES[raw] || raw;
  if (!country || !getCountry(country.toLowerCase())) {
    throw new Error(`Unsupported acquisition country: ${country || '(blank)'}`);
  }
  return country;
}

export function acquisitionCountryConfig(country) {
  const normalized = normalizeAcquisitionCountry(country);
  const definition = getCountry(normalized.toLowerCase());
  const acquisition = definition?.acquisition;
  if (!acquisition?.snapshotPath || !acquisition?.snapshotExport || !acquisition?.geographyKind) {
    throw new Error(`Acquisition metadata is incomplete for ${normalized}`);
  }
  return Object.freeze({
    country: normalized,
    country_name: definition.name,
    status: definition.status,
    enabled: Boolean(acquisition.enabled),
    locale: definition.locale,
    currency: definition.currency,
    canonical_path: definition.canonicalPath,
    snapshot_path: acquisition.snapshotPath,
    snapshot_export: acquisition.snapshotExport,
    geography_kind: acquisition.geographyKind,
    jurisdiction_prefix: acquisition.jurisdictionPrefix,
    acquisition_terms: definition.acquisitionTerms,
    search_terms: definition.searchTerms
  });
}

export function listAcquisitionCountries({ enabled } = {}) {
  const countries = listCountries().map(country => acquisitionCountryConfig(country.code));
  return typeof enabled === 'boolean' ? countries.filter(country => country.enabled === enabled) : countries;
}

export function isAcquisitionCountryEnabled(country) {
  return acquisitionCountryConfig(country).enabled;
}

export function assertAcquisitionCountryEnabled(country) {
  const config = acquisitionCountryConfig(country);
  if (!config.enabled) throw new Error(`Acquisition country is planned but not enabled: ${config.country}`);
  return config;
}

export function acquisitionSnapshotPath(country) {
  return acquisitionCountryConfig(country).snapshot_path;
}

export function acquisitionSnapshotExport(country) {
  return acquisitionCountryConfig(country).snapshot_export;
}

function defaultJurisdiction(config, code) {
  const prefix = String(config.jurisdiction_prefix || '').trim();
  if (!prefix || code === prefix || code.startsWith(`${prefix}-`)) return code;
  return `${prefix}-${code}`;
}

export function buildAcquisitionContext(country, unit = {}, options = {}) {
  const config = options.require_enabled
    ? assertAcquisitionCountryEnabled(country)
    : acquisitionCountryConfig(country);
  const code = String(unit.code || '').trim();
  const name = String(unit.name || '').trim();
  if (!code || !name) throw new Error('Acquisition unit requires code and name');

  return Object.freeze({
    country: config.country,
    country_name: config.country_name,
    currency: config.currency,
    locale: config.locale,
    unit_code: code,
    unit_name: name,
    jurisdiction: String(unit.jurisdiction || defaultJurisdiction(config, code)),
    schedule_order: Number(unit.schedule_order || 0),
    snapshot_path: config.snapshot_path,
    snapshot_export: config.snapshot_export,
    geography_kind: config.geography_kind
  });
}

export function compareAcquisitionUnits(a, b) {
  return Number(a?.schedule_order || 0) - Number(b?.schedule_order || 0)
    || String(a?.code || a?.unit_code || '').localeCompare(String(b?.code || b?.unit_code || ''));
}
