'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { discoveryQueries } = require('../acquisition/source-discovery');
const { discover } = require('../scripts/discover-source-candidates');

test('organiser discovery rotates precise nationwide query templates', () => {
  const queries = discoveryQueries({ limit: 50, offset: 3 });
  assert.equal(queries.length, 50);
  assert.ok(new Set(queries.map(item => item.region)).size >= 6);
  assert.ok(queries.every(item => /official|site:\.gov\.uk/i.test(item.query)));
});

test('bounded discovery produces candidates without production writes', async () => {
  const result = await discover({
    now: '2026-08-26T10:00:00Z', plans: [{ region: 'Kent', query: 'Kent market operator become a trader official' }],
    preflight: { allowed: true }, search: async query => [{ query, title: 'Example Market traders', url: 'https://examplemarket.co.uk/traders', snippet: 'Apply to become a trader' }],
    fetchBatch: async candidates => candidates.map(candidate => ({ candidate, fetch_status: 'fetched', final_url: candidate.url, page_text: '<h1>Example Market</h1><p>Apply to become a market trader in Kent England.</p>' }))
  });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].classification, 'manual-review-required');
});
