import test from 'node:test';
import assert from 'node:assert/strict';

import { acquireBatch } from '../../platform/findpitches-v2/engine/acquire-batch.mjs';

const CASES = [
  { market: 'GB', region_code: 'KENT', location: 'Kent' },
  { market: 'US', region_code: 'TX', location: 'Texas' },
  { market: 'CA', region_code: 'ON', location: 'Ontario' }
];

for (const scenario of CASES) {
  test(`shared acquireBatch handles ${scenario.market}/${scenario.region_code}`, async () => {
    const result = await acquireBatch(
      { ...scenario, query_limit: 3 },
      {
        searchProvider: {
          async search({ query }) {
            return [
              { url: `https://organiser.test/apply?utm_source=search&q=${encodeURIComponent(query)}`, title: 'Apply' },
              { url: 'https://organiser.test/duplicate?fbclid=tracking', title: 'Duplicate' },
              { url: 'https://organiser.test/duplicate', title: 'Duplicate again' }
            ];
          }
        },
        async evaluateCandidate({ market, result }) {
          if (result.url.includes('/duplicate')) {
            return { market: market.code, source_url: result.url, status: 'duplicate', publishable: false };
          }
          return { market: market.code, source_url: result.url, status: 'validated', publishable: true };
        }
      }
    );

    assert.equal(result.engine, 'findpitches-v2');
    assert.equal(result.market, scenario.market);
    assert.equal(result.region, scenario.region_code);
    assert.equal(result.metrics.queries, 3);
    assert.equal(result.metrics.search_errors, 0);
    assert.ok(result.metrics.unique_urls >= 2);
    assert.ok(result.publishable.length >= 1);
    assert.ok(result.duplicates.length >= 1);

    const keys = Object.keys(result).sort();
    assert.deepEqual(keys, [
      'candidates',
      'completed_at',
      'duplicates',
      'engine',
      'held',
      'location',
      'market',
      'metrics',
      'publishable',
      'queries',
      'region',
      'rejected',
      'results',
      'search_errors',
      'started_at',
      'validated'
    ]);
  });
}

test('one failed search query does not fail the batch', async () => {
  let calls = 0;
  const result = await acquireBatch(
    { market: 'GB', region_code: 'KENT', location: 'Kent', query_limit: 2 },
    {
      searchProvider: {
        async search() {
          calls += 1;
          if (calls === 1) throw new Error('provider timeout');
          return [{ url: 'https://example.test/apply' }];
        }
      },
      async evaluateCandidate({ result }) {
        return { source_url: result.url, status: 'validated', publishable: true };
      }
    }
  );

  assert.equal(result.metrics.search_errors, 1);
  assert.equal(result.publishable.length, 1);
});
