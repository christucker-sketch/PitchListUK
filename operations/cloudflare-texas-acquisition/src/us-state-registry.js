import { TEXAS_SOURCES } from '../../opportunity-pipeline/config/texas-source-registry.js';
import { FLORIDA_SOURCES } from '../../opportunity-pipeline/config/florida-sources.js';
import { CALIFORNIA_SOURCES } from '../../opportunity-pipeline/config/california-source-registry.js';
import { NEW_YORK_SOURCES } from '../../opportunity-pipeline/config/new-york-source-registry.js';
import { PENNSYLVANIA_SOURCES } from '../../opportunity-pipeline/config/pennsylvania-source-registry.js';
import { ILLINOIS_SOURCES } from '../../opportunity-pipeline/config/illinois-source-registry.js';
import { OHIO_SOURCES } from '../../opportunity-pipeline/config/ohio-source-registry.js';
import { GEORGIA_SOURCES } from '../../opportunity-pipeline/config/georgia-source-registry.js';
import { NORTH_CAROLINA_SOURCES } from '../../opportunity-pipeline/config/north-carolina-source-registry.js';
import { MICHIGAN_SOURCES } from '../../opportunity-pipeline/config/michigan-source-registry.js';
import { VIRGINIA_SOURCES } from '../../opportunity-pipeline/config/virginia-source-registry.js';
import { WASHINGTON_SOURCES } from '../../opportunity-pipeline/config/washington-source-registry.js';
import { MASSACHUSETTS_SOURCES } from '../../opportunity-pipeline/config/massachusetts-source-registry.js';
import { COLORADO_SOURCES } from '../../opportunity-pipeline/config/colorado-source-registry.js';
import { ARIZONA_SOURCES } from '../../opportunity-pipeline/config/arizona-source-registry.js';
import { NEW_JERSEY_SOURCES } from '../../opportunity-pipeline/config/new-jersey-source-registry.js';
import { TENNESSEE_SOURCES } from '../../opportunity-pipeline/config/tennessee-source-registry.js';
import { INDIANA_SOURCES } from '../../opportunity-pipeline/config/indiana-source-registry.js';
import { MISSOURI_SOURCES } from '../../opportunity-pipeline/config/missouri-source-registry.js';
import { MARYLAND_SOURCES } from '../../opportunity-pipeline/config/maryland-source-registry.js';
import { MINNESOTA_SOURCES } from '../../opportunity-pipeline/config/minnesota-source-registry.js';
import { WISCONSIN_SOURCES } from '../../opportunity-pipeline/config/wisconsin-source-registry.js';
import { OREGON_SOURCES } from '../../opportunity-pipeline/config/oregon-source-registry.js';
import { SOUTH_CAROLINA_SOURCES } from '../../opportunity-pipeline/config/south-carolina-source-registry.js';

const entry = (code, name, slug, order, sources) => Object.freeze({ code, name, slug, jurisdiction: `US-${code}`, enabled: true, schedule_order: order, sources, snapshot_path: 'functions/_data/us-opportunities.mjs' });

export const US_STATE_ACQUISITION = Object.freeze({
  TX: entry('TX','Texas','texas',10,TEXAS_SOURCES), FL: entry('FL','Florida','florida',20,FLORIDA_SOURCES), CA: entry('CA','California','california',30,CALIFORNIA_SOURCES), NY: entry('NY','New York','new-york',40,NEW_YORK_SOURCES),
  PA: entry('PA','Pennsylvania','pennsylvania',50,PENNSYLVANIA_SOURCES), IL: entry('IL','Illinois','illinois',60,ILLINOIS_SOURCES), OH: entry('OH','Ohio','ohio',70,OHIO_SOURCES), GA: entry('GA','Georgia','georgia',80,GEORGIA_SOURCES), NC: entry('NC','North Carolina','north-carolina',90,NORTH_CAROLINA_SOURCES),
  MI: entry('MI','Michigan','michigan',100,MICHIGAN_SOURCES), VA: entry('VA','Virginia','virginia',110,VIRGINIA_SOURCES), WA: entry('WA','Washington','washington',120,WASHINGTON_SOURCES), MA: entry('MA','Massachusetts','massachusetts',130,MASSACHUSETTS_SOURCES), CO: entry('CO','Colorado','colorado',140,COLORADO_SOURCES),
  AZ: entry('AZ','Arizona','arizona',150,ARIZONA_SOURCES), NJ: entry('NJ','New Jersey','new-jersey',160,NEW_JERSEY_SOURCES), TN: entry('TN','Tennessee','tennessee',170,TENNESSEE_SOURCES), IN: entry('IN','Indiana','indiana',180,INDIANA_SOURCES), MO: entry('MO','Missouri','missouri',190,MISSOURI_SOURCES),
  MD: entry('MD','Maryland','maryland',200,MARYLAND_SOURCES), MN: entry('MN','Minnesota','minnesota',210,MINNESOTA_SOURCES), WI: entry('WI','Wisconsin','wisconsin',220,WISCONSIN_SOURCES), OR: entry('OR','Oregon','oregon',230,OREGON_SOURCES), SC: entry('SC','South Carolina','south-carolina',240,SOUTH_CAROLINA_SOURCES)
});

export function getStateConfig(code) {
  const normalized = String(code || '').trim().toUpperCase();
  const state = US_STATE_ACQUISITION[normalized];
  if (!state || !state.enabled) throw new Error(`Unsupported or disabled US acquisition state: ${normalized || '(blank)'}`);
  return state;
}

export function enabledStates() {
  return Object.values(US_STATE_ACQUISITION).filter(state => state.enabled).sort((a, b) => a.schedule_order - b.schedule_order || a.code.localeCompare(b.code));
}
