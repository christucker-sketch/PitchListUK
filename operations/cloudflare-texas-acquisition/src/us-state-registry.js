import { TEXAS_SOURCES } from '../../opportunity-pipeline/config/texas-source-registry.js';

export const US_STATE_ACQUISITION = Object.freeze({
  TX: Object.freeze({
    code: 'TX',
    name: 'Texas',
    slug: 'texas',
    jurisdiction: 'US-TX',
    enabled: true,
    schedule_order: 10,
    sources: TEXAS_SOURCES,
    snapshot_path: 'functions/_data/us-opportunities.mjs'
  })
});

export function getStateConfig(code) {
  const normalized = String(code || '').trim().toUpperCase();
  const state = US_STATE_ACQUISITION[normalized];
  if (!state || !state.enabled) throw new Error(`Unsupported or disabled US acquisition state: ${normalized || '(blank)'}`);
  return state;
}

export function enabledStates() {
  return Object.values(US_STATE_ACQUISITION)
    .filter(state => state.enabled)
    .sort((a, b) => a.schedule_order - b.schedule_order || a.code.localeCompare(b.code));
}
