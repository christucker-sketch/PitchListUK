import {
  acquisitionCountryConfig,
  acquisitionSnapshotExport,
  assertAcquisitionCountryEnabled,
  buildAcquisitionContext,
  listAcquisitionCountries
} from './country-contract.mjs';

function freezeArray(value) {
  return Object.freeze(Array.isArray(value) ? [...value] : []);
}

export function globalAcquisitionMarkets(options = {}) {
  return Object.freeze(listAcquisitionCountries(options));
}

export function getGlobalAcquisitionMarket(country, options = {}) {
  return options.require_enabled === false
    ? acquisitionCountryConfig(country)
    : assertAcquisitionCountryEnabled(country);
}

export function buildGlobalAcquisitionUnit(country, unit = {}, options = {}) {
  const requireEnabled = options.require_enabled !== false;
  const context = buildAcquisitionContext(country, unit, { require_enabled: requireEnabled });
  const code = context.unit_code;
  const name = context.unit_name;

  return Object.freeze({
    ...context,
    code,
    name,
    slug: String(unit.slug || code).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    enabled: unit.enabled !== false,
    sources: freezeArray(unit.sources),
    ...(unit.workflow_batch_max_sources ? { workflow_batch_max_sources: Number(unit.workflow_batch_max_sources) } : {})
  });
}

export function acquisitionDiscoveryProfile(country, options = {}) {
  const market = getGlobalAcquisitionMarket(country, options);
  return Object.freeze({
    country: market.country,
    locale: market.locale,
    acquisition_terms: freezeArray(market.acquisition_terms),
    search_terms: freezeArray(market.search_terms)
  });
}

export function parseAcquisitionSnapshotModule(source, country) {
  const exportName = acquisitionSnapshotExport(country);
  const escaped = exportName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(source || '').match(new RegExp(`export\\s+const\\s+${escaped}\\s*=\\s*([\\s\\S]*);\\s*$`));
  if (!match) throw new Error(`Could not parse ${country} production snapshot module (${exportName})`);
  return JSON.parse(match[1]);
}

export function serializeAcquisitionSnapshotModule(snapshot, country) {
  const exportName = acquisitionSnapshotExport(country);
  return `export const ${exportName} = ${JSON.stringify(snapshot, null, 2)};\n`;
}

export function globalAcquisitionServiceIdentity() {
  return 'FindPitches-Global-Acquisition/1.0';
}
