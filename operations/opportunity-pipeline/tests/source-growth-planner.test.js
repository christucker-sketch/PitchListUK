'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { batchId, isLowYield, planAcceleratedDiscovery } = require('../lib/source-growth-planner');

test('accelerated discovery does not repeat completed region/template batches', () => {
  const templates = [{ id: 'good', priority: 10, query: region => `${region} trader applications official` }];
  const result = planAcceleratedDiscovery({ regions: ['Kent', 'Essex'], templates, completed: [batchId('Kent', 'good')], limit: 2 });
  assert.deepEqual(result.plans.map(item => item.batch_id), [batchId('Essex', 'good')]);
});

test('accelerated discovery suppresses proven low-yield templates', () => {
  assert.equal(isLowYield({ candidates: 5, viable: 0, blocked: 3, rejected: 1 }), true);
  const query = 'Kent agricultural county show trade stand application official';
  const records = Array.from({ length: 5 }, () => ({ discovery_query: query, classification: 'rejected-aggregator' }));
  const templates = [{ id: 'county_show', priority: 10, query: region => `${region} county show trade stand applications official` }];
  const result = planAcceleratedDiscovery({ regions: ['Kent'], templates, records, limit: 1 });
  assert.equal(result.plans.length, 0);
});
