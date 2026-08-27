import { TEXAS_PILOT_SOURCES, TEXAS_PILOT_EXCLUSIONS } from './texas-pilot-sources.js';

export const TEXAS_PILOT_RUN = Object.freeze({
  id: 'pli-009-texas-pilot-2026-08-27',
  country_code: 'US',
  region_code: 'TX',
  mode: 'staging-only',
  automatic_publish: false,
  production_writes: false,
  source_count: TEXAS_PILOT_SOURCES.length,
  excluded_count: TEXAS_PILOT_EXCLUSIONS.length,
  sources: TEXAS_PILOT_SOURCES,
  exclusions: TEXAS_PILOT_EXCLUSIONS,
});

export function assertTexasPilotRun(run = TEXAS_PILOT_RUN) {
  if (run.country_code !== 'US' || run.region_code !== 'TX') throw new Error('Texas pilot must remain US-TX scoped');
  if (run.mode !== 'staging-only' || run.automatic_publish !== false || run.production_writes !== false) {
    throw new Error('Texas pilot must remain staging only');
  }
  if (run.source_count !== run.sources.length) throw new Error('Texas pilot source count mismatch');
  return true;
}
