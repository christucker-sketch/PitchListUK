import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CA_DISCOVERY_PLAN_SIZE,
  CA_DISCOVERY_TEMPLATES,
  canadaDiscoveryQueries,
  nextCanadaDiscoveryOffset
} from '../operations/cloudflare-global-acquisition/lib/ca-source-discovery-plan.mjs';

test('Canada discovery plan covers every province and territory across eight bounded templates', () => {
  assert.equal(CA_DISCOVERY_TEMPLATES.length, 8);
  assert.equal(CA_DISCOVERY_PLAN_SIZE, 104);
  const plan = canadaDiscoveryQueries({ limit: 12, offset: 0 });
  assert.equal(plan.length, 12);
  assert.equal(plan[0].country, 'CA');
  assert.equal(plan[0].region_code, 'AB');
  assert.equal(plan[0].jurisdiction, 'CA-AB');
  assert.match(plan[0].query, /Alberta/);
  assert.match(plan[0].query, /Canada/);
});

test('Canada discovery plan is deterministic and advances from province to province', () => {
  const alberta = canadaDiscoveryQueries({ limit: 8, offset: 0 });
  assert.ok(alberta.every(item => item.region_code === 'AB'));
  const britishColumbia = canadaDiscoveryQueries({ limit: 4, offset: 8 });
  assert.ok(britishColumbia.every(item => item.region_code === 'BC'));
  assert.deepEqual(canadaDiscoveryQueries({ limit: 4, offset: 8 }), britishColumbia);
});

test('Canada discovery plan wraps cleanly and caps each batch at twelve queries', () => {
  assert.equal(canadaDiscoveryQueries({ limit: 99 }).length, 12);
  assert.equal(nextCanadaDiscoveryOffset(100, 4), 0);
  const wrapped = canadaDiscoveryQueries({ limit: 8, offset: 100 });
  assert.equal(wrapped[0].region_code, 'YT');
  assert.equal(wrapped[4].region_code, 'AB');
});
