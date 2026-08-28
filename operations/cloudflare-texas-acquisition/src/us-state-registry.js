import { TEXAS_SOURCES } from '../../opportunity-pipeline/config/texas-source-registry.js';
import { FLORIDA_SOURCES } from '../../opportunity-pipeline/config/florida-sources.js';
import { CALIFORNIA_SOURCES } from '../../opportunity-pipeline/config/california-source-registry.js';
import { NEW_YORK_SOURCES } from '../../opportunity-pipeline/config/new-york-source-registry.js';

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
  }),
  FL: Object.freeze({
    code: 'FL',
    name: 'Florida',
    slug: 'florida',
    jurisdiction: 'US-FL',
    enabled: true,
    schedule_order: 20,
    sources: FLORIDA_SOURCES,
    snapshot_path: 'functions/_data/us-opportunities.mjs'
  }),
  CA: Object.freeze({
    code: 'CA',
    name: 'California',
    slug: 'california',
    jurisdiction: 'US-CA',
    enabled: true,
    schedule_order: 30,
    sources: CALIFORNIA_SOURCES,
    snapshot_path: 'functions/_data/us-opportunities.mjs'
  }),
  NY: Object.freeze({
    code: 'NY',
    name: 'New York',
    slug: 'new-york',
    jurisdiction: 'US-NY',
    enabled: true,
    schedule_order: 40,
    sources: NEW_YORK_SOURCES,
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
