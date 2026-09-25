import test from 'node:test';
import assert from 'node:assert/strict';

import { enabledMarkets, getMarket, MARKETS } from '../../platform/findpitches-v2/markets/registry.mjs';

test('eight global markets are enabled through one market registry', () => {
  assert.deepEqual(enabledMarkets().map(market => market.code).sort(), ['AU', 'CA', 'GB', 'HK', 'IE', 'NZ', 'SG', 'US']);
  assert.equal(MARKETS.GB.currency, 'GBP');
  assert.equal(MARKETS.US.currency, 'USD');
  assert.equal(MARKETS.CA.currency, 'CAD');
  assert.equal(MARKETS.AU.currency, 'AUD');
  assert.equal(MARKETS.IE.currency, 'EUR');
  assert.equal(MARKETS.NZ.currency, 'NZD');
  assert.equal(MARKETS.SG.currency, 'SGD');
  assert.equal(MARKETS.HK.currency, 'HKD');
});

test('market lookup is normalized and fails closed for unknown markets', () => {
  assert.equal(getMarket('gb').code, 'GB');
  assert.throws(() => getMarket('XX'), /findpitches_v2_market_unknown/);
});
