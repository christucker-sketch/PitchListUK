import { TEXAS_SOURCES } from '../../opportunity-pipeline/config/texas-source-registry.js';
import { FLORIDA_SOURCES } from '../../opportunity-pipeline/config/florida-sources.js';
import { CALIFORNIA_SOURCES } from '../../opportunity-pipeline/config/california-source-registry.js';
import { NEW_YORK_SOURCES } from '../../opportunity-pipeline/config/new-york-source-registry.js';
import { PENNSYLVANIA_SOURCES } from '../../opportunity-pipeline/config/pennsylvania-source-registry.js';
import { ILLINOIS_SOURCES } from '../../opportunity-pipeline/config/illinois-source-registry.js';
import { OHIO_SOURCES } from '../../opportunity-pipeline/config/ohio-source-registry.js';
import { GEORGIA_SOURCES } from '../../opportunity-pipeline/config/georgia-source-registry.js';
import { NORTH_CAROLINA_SOURCES } from '../../opportunity-pipeline/config/north-carolina-source-registry.js';

export const US_STATE_ACQUISITION = Object.freeze({
  TX: Object.freeze({ code: 'TX', name: 'Texas', slug: 'texas', jurisdiction: 'US-TX', enabled: true, schedule_order: 10, sources: TEXAS_SOURCES, snapshot_path: 'functions/_data/us-opportunities.mjs' }),
  FL: Object.freeze({ code: 'FL', name: 'Florida', slug: 'florida', jurisdiction: 'US-FL', enabled: true, schedule_order: 20, sources: FLORIDA_SOURCES, snapshot_path: 'functions/_data/us-opportunities.mjs' }),
  CA: Object.freeze({ code: 'CA', name: 'California', slug: 'california', jurisdiction: 'US-CA', enabled: true, schedule_order: 30, sources: CALIFORNIA_SOURCES, snapshot_path: 'functions/_data/us-opportunities.mjs' }),
  NY: Object.freeze({ code: 'NY', name: 'New York', slug: 'new-york', jurisdiction: 'US-NY', enabled: true, schedule_order: 40, sources: NEW_YORK_SOURCES, snapshot_path: 'functions/_data/us-opportunities.mjs' }),
  PA: Object.freeze({ code: 'PA', name: 'Pennsylvania', slug: 'pennsylvania', jurisdiction: 'US-PA', enabled: true, schedule_order: 50, sources: PENNSYLVANIA_SOURCES, snapshot_path: 'functions/_data/us-opportunities.mjs' }),
  IL: Object.freeze({ code: 'IL', name: 'Illinois', slug: 'illinois', jurisdiction: 'US-IL', enabled: true, schedule_order: 60, sources: ILLINOIS_SOURCES, snapshot_path: 'functions/_data/us-opportunities.mjs' }),
  OH: Object.freeze({ code: 'OH', name: 'Ohio', slug: 'ohio', jurisdiction: 'US-OH', enabled: true, schedule_order: 70, sources: OHIO_SOURCES, snapshot_path: 'functions/_data/us-opportunities.mjs' }),
  GA: Object.freeze({ code: 'GA', name: 'Georgia', slug: 'georgia', jurisdiction: 'US-GA', enabled: true, schedule_order: 80, sources: GEORGIA_SOURCES, snapshot_path: 'functions/_data/us-opportunities.mjs' }),
  NC: Object.freeze({ code: 'NC', name: 'North Carolina', slug: 'north-carolina', jurisdiction: 'US-NC', enabled: true, schedule_order: 90, sources: NORTH_CAROLINA_SOURCES, snapshot_path: 'functions/_data/us-opportunities.mjs' })
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
