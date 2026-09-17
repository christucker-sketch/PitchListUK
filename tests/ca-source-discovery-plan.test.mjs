import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CA_DISCOVERY_PLAN_SIZE,
  CA_DISCOVERY_TEMPLATES,
  canadaDiscoveryQueries,
  nextCanadaDiscoveryOffset
} from '../operations/cloudflare-global-acquisition/lib/ca-source-discovery-plan.mjs';

test('Canada discovery plan covers every province and territory across ten opportunity-first templates', () => {
  assert.equal(CA_DISCOVERY_TEMPLATES.length, 10);
  assert.equal(CA_DISCOVERY_PLAN_SIZE, 130);
  const plan = canadaDiscoveryQueries({ limit: 12, offset: 0 });
  assert.equal(plan.length, 12);
  assert.equal(plan[0].country, 'CA');
  assert.equal(plan[0].region_code, 'AB');
  assert.equal(plan[0].jurisdiction, 'CA-AB');
  assert.match(plan[0].query, /Alberta/);
  assert.match(plan[0].query, /Canada/);
});

test('Canada discovery prioritises direct vendor application intent before public-service fallbacks', () => {
  assert.deepEqual(CA_DISCOVERY_TEMPLATES.map(template => template.id), [
    'vendor_applications_open',
    'become_a_vendor',
    'festival_vendor',
    'farmers_market',
    'artisan_market',
    'food_vendor',
    'holiday_market',
    'exhibitor_application',
    'public_market',
    'municipal_market'
  ]);
  const alberta = canadaDiscoveryQueries({ limit: 4, offset: 0 });
  assert.match(alberta[0].query, /vendor applications/);
  assert.match(alberta[1].query, /become a vendor/);
  assert.match(alberta[2].query, /festival vendor application/);
  assert.match(alberta[3].query, /farmers market vendor application/);
});

test('Canada discovery plan is deterministic and advances from province to province', () => {
  const alberta = canadaDiscoveryQueries({ limit: 10, offset: 0 });
  assert.ok(alberta.every(item => item.region_code === 'AB'));
  const britishColumbia = canadaDiscoveryQueries({ limit: 4, offset: 10 });
  assert.ok(britishColumbia.every(item => item.region_code === 'BC'));
  assert.deepEqual(canadaDiscoveryQueries({ limit: 4, offset: 10 }), britishColumbia);
});

test('Canada discovery plan wraps cleanly and caps each batch at twelve queries', () => {
  assert.equal(canadaDiscoveryQueries({ limit: 99 }).length, 12);
  assert.equal(nextCanadaDiscoveryOffset(128, 4), 2);
  const wrapped = canadaDiscoveryQueries({ limit: 4, offset: 128 });
  assert.equal(wrapped[0].region_code, 'YT');
  assert.equal(wrapped[2].region_code, 'AB');
});