import { assertAcquisitionCountryEnabled, normalizeAcquisitionCountry } from '../../../platform/acquisition/country-contract.mjs';

const READ_ONLY_MODE = 'approved_source_cloudflare_read_only_poll';
const MODES = Object.freeze({
  US: Object.freeze(new Set(['acquire', 'discover', READ_ONLY_MODE])),
  UK: Object.freeze(new Set([READ_ONLY_MODE]))
});

export function resolveGlobalAcquisitionDispatch(payload = {}) {
  if (!payload.country) throw new Error('Global acquisition requires an explicit country');
  const country = normalizeAcquisitionCountry(payload.country);
  assertAcquisitionCountryEnabled(country);

  const mode = String(payload.mode || READ_ONLY_MODE).trim();
  if (!MODES[country]?.has(mode)) throw new Error(`Unsupported ${country} global acquisition mode: ${mode || '(blank)'}`);

  const readOnly = mode === READ_ONLY_MODE;
  const handler = country === 'UK'
    ? 'uk_approved_source_poll'
    : readOnly
      ? 'us_approved_source_poll'
      : 'us_production_workflow';

  return Object.freeze({
    country,
    mode,
    handler,
    mutation_capable: !readOnly,
    payload: Object.freeze({ ...payload, country, mode })
  });
}

export function globalControllerExecutionEnabled(env = {}) {
  return String(env.GLOBAL_ACQUISITION_EXECUTION_ENABLED || '').trim().toLowerCase() === 'true';
}

export function globalControllerExecutionLevel(env = {}) {
  if (!globalControllerExecutionEnabled(env)) return 'disabled';
  const level = String(env.GLOBAL_ACQUISITION_EXECUTION_LEVEL || '').trim().toLowerCase();
  if (level === 'read_only' || level === 'production') return level;
  return 'invalid';
}

export function assertGlobalControllerDispatchAllowed(env, dispatch) {
  const level = globalControllerExecutionLevel(env);
  if (level === 'disabled') throw new Error('Global acquisition controller execution is disabled');
  if (level === 'invalid') throw new Error('Global acquisition controller execution level is invalid');
  if (level === 'read_only' && dispatch?.mutation_capable) {
    throw new Error(`Global acquisition controller is read-only; ${dispatch.country} ${dispatch.mode} is not permitted`);
  }
  return true;
}

export { READ_ONLY_MODE };
