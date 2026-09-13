import assert from 'node:assert/strict';
import test from 'node:test';

import {
  INTERNAL_SERPER_BROKER,
  validateInternalSerperPayload
} from '../operations/cloudflare-texas-acquisition/src/internal-serper-broker.js';

test('internal Serper broker preserves UK defaults and supports Canada explicitly', () => {
  assert.deepEqual(validateInternalSerperPayload({ q: 'market vendors' }), { q: 'market vendors', num: 5, gl: 'uk', hl: 'en' });
  assert.deepEqual(validateInternalSerperPayload({ market: 'CA', q: 'Ontario vendor application', num: 8 }), {
    q: 'Ontario vendor application', num: 8, gl: 'ca', hl: 'en'
  });
  assert.deepEqual(INTERNAL_SERPER_BROKER.supported_markets, ['UK', 'CA']);
});

test('internal Serper broker rejects unsupported markets and non-finite result counts', () => {
  assert.throws(() => validateInternalSerperPayload({ market: 'US', q: 'vendors' }), /internal_serper_market_invalid/);
  assert.throws(() => validateInternalSerperPayload({ market: 'CA', q: 'vendors', num: 'banana' }), /internal_serper_num_invalid/);
});

test('internal Serper broker keeps Canada requests bounded', () => {
  assert.equal(validateInternalSerperPayload({ market: 'CA', q: 'vendors', num: 99 }).num, 8);
  assert.equal(validateInternalSerperPayload({ market: 'CA', q: 'vendors', num: -5 }).num, 1);
});
