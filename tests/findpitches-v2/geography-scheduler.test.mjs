import test from 'node:test';
import assert from 'node:assert/strict';

import { enabledMarkets } from '../../platform/findpitches-v2/markets/registry.mjs';
import { enabledGeographies, GEOGRAPHY_CATALOG_VERSION } from '../../platform/findpitches-v2/geography/catalog.mjs';
import { roundRobinSchedule } from '../../platform/findpitches-v2/scheduler/catalogue.mjs';

test('global geography catalogue covers every enabled market', () => {
  const markets = enabledMarkets().map(market => market.code);
  for (const market of markets) {
    assert.ok(enabledGeographies(market).length > 0, `${market} must have geography data`);
  }

  assert.equal(enabledGeographies('GB').length, 48);
  assert.equal(enabledGeographies('US').length, 50);
  assert.equal(enabledGeographies('CA').length, 13);
  assert.match(GEOGRAPHY_CATALOG_VERSION, /^\d{4}-\d{2}-\d{2}\./);
});

test('round-robin scheduler covers every geography once and interleaves markets', () => {
  const schedule = roundRobinSchedule();

  assert.equal(schedule.length, 111);
  assert.deepEqual(
    schedule.slice(0, 6).map(item => [item.market, item.code]),
    [
      ['GB', 'GB-ENG-BEDS'],
      ['US', 'AL'],
      ['CA', 'AB'],
      ['GB', 'GB-ENG-BERKS'],
      ['US', 'AK'],
      ['CA', 'BC']
    ]
  );

  const identities = schedule.map(item => `${item.market}:${item.code}`);
  assert.equal(new Set(identities).size, identities.length);
});
