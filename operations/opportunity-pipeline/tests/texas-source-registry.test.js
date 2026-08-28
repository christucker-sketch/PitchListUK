import test from 'node:test';
import assert from 'node:assert/strict';
import { TEXAS_PILOT_SOURCES } from '../config/texas-pilot-sources.js';
import { TEXAS_EXPANSION_SOURCES } from '../config/texas-expansion-sources.js';
import { TEXAS_EXPANSION_SOURCES_BATCH_2 } from '../config/texas-expansion-sources-batch2.js';
import { TEXAS_SOURCES } from '../config/texas-source-registry.js';

test('Texas combined registry contains every reviewed route with ID overrides applied', () => {
  const expected = new Map();
  for (const source of TEXAS_PILOT_SOURCES) expected.set(source.id, source);
  for (const source of TEXAS_EXPANSION_SOURCES) expected.set(source.id, source);
  for (const source of TEXAS_EXPANSION_SOURCES_BATCH_2) expected.set(source.id, source);

  assert.equal(TEXAS_SOURCES.length, expected.size);
  assert.equal(new Set(TEXAS_SOURCES.map(source => source.id)).size, TEXAS_SOURCES.length);
  assert.deepEqual(TEXAS_SOURCES.map(source => source.id), [...expected.keys()]);
  assert.ok(TEXAS_SOURCES.every(source => source.country_code === 'US'));
  assert.ok(TEXAS_SOURCES.every(source => source.region_code === 'TX'));
  assert.ok(TEXAS_SOURCES.every(source => source.jurisdiction === 'US-TX'));
  assert.ok(TEXAS_SOURCES.every(source => source.status === 'approved-pilot'));
});

test('Round Rock uses the direct 2026 application route', () => {
  const source = TEXAS_SOURCES.find(item => item.id === 'tx-round-rock-trailside-market-2026');
  assert.ok(source);
  assert.match(source.application_url, /formcode=TrailsideMarket2026/);
});
