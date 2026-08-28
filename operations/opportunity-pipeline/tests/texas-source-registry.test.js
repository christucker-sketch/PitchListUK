import test from 'node:test';
import assert from 'node:assert/strict';
import { TEXAS_SOURCES } from '../config/texas-source-registry.js';

test('Texas combined registry expands to 23 unique reviewed routes', () => {
  assert.equal(TEXAS_SOURCES.length, 23);
  assert.equal(new Set(TEXAS_SOURCES.map(source => source.id)).size, TEXAS_SOURCES.length);
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
