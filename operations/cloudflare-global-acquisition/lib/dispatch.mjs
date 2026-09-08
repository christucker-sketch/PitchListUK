import { assertAcquisitionCountryEnabled, normalizeAcquisitionCountry } from '../../../platform/acquisition/country-contract.mjs';

const MODES = Object.freeze({
  US: Object.freeze(new Set(['acquire', 'discover'])),
  UK: Object.freeze(new Set(['approved_source_cloudflare_read_only_poll']))
});

export function resolveGlobalAcquisitionDispatch(payload = {}) {
  if (!payload.country) throw new Error('Global acquisition requires an explicit country');
  const country = normalizeAcquisitionCountry(payload.country);
  assertAcquisitionCountryEnabled(country);

  const mode = String(payload.mode || (country === 'US' ? 'acquire' : 'approved_source_cloudflare_read_only_poll')).trim();
  if (!MODES[country]?.has(mode)) throw new Error(`Unsupported ${country} global acquisition mode: ${mode || '(blank)'}`);

  return Object.freeze({
    country,
    mode,
    handler: country === 'US' ? 'us_production_workflow' : 'uk_approved_source_poll',
    mutation_capable: country === 'US',
    payload: Object.freeze({ ...payload, country, mode })
  });
}

export function globalControllerExecutionEnabled(env = {}) {
  return String(env.GLOBAL_ACQUISITION_EXECUTION_ENABLED || '').trim().toLowerCase() === 'true';
}
