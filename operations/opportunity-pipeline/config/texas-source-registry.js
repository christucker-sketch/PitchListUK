import { TEXAS_PILOT_SOURCES, TEXAS_PILOT_EXCLUSIONS } from './texas-pilot-sources.js';
import { TEXAS_EXPANSION_SOURCES } from './texas-expansion-sources.js';
import { TEXAS_EXPANSION_SOURCES_BATCH_2 } from './texas-expansion-sources-batch2.js';
import { TEXAS_EXPANSION_SOURCES_BATCH_3 } from './texas-expansion-sources-batch3.js';

const byId = new Map(TEXAS_PILOT_SOURCES.map(source => [source.id, source]));
for (const source of TEXAS_EXPANSION_SOURCES) byId.set(source.id, source);
for (const source of TEXAS_EXPANSION_SOURCES_BATCH_2) byId.set(source.id, source);
for (const source of TEXAS_EXPANSION_SOURCES_BATCH_3) byId.set(source.id, source);

export const TEXAS_SOURCES = Object.freeze([...byId.values()]);
export const TEXAS_EXCLUSIONS = TEXAS_PILOT_EXCLUSIONS;
