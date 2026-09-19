import test from 'node:test';
import assert from 'node:assert/strict';

import { enabledMarkets, getMarket, MARKETS } from '../../platform/findpitches-v2/markets/registry.mjs';

test('GB, US and CA are enabled through one market registry', () => {
  assert.deepEqual(enabledMarkets().map(market => market.code).sort(), ['CA', 'GB', 'US']);
  assert.equal(MARKETS.GB.currency, 'GBP');
  assert.equal(MARKETS.US.currency, 'USD');
  assert.equal(MARKETS.CA.currency, 'CAD');
});

test('market lookup is normalized and fails closed for unknown markets', () => {
  assert.equal(getMarket('gb').code, 'GB');
  assert.throws(() => getMarket('XX'), /findpitches_v2_market_unknown/);
});
