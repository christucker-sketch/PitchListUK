import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  normalizeGrowthCandidates
} from '../../cloudflare-texas-acquisition/src/us-growth-discovery.js';

test('growth discovery strips search tracking parameters before route dedupe', () => {
  const plan = {
    id: 'ma-salem-2027-food-truck',
    state_code: 'MA',
    state_name: 'Massachusetts',
    locality: 'Salem',
    year: 2027,
    template_id: 'food-truck',
    query: 'test'
  };

  const normalized = normalizeGrowthCandidates({
    plans: [plan],
    searchBatches: [{
      plan_id: plan.id,
      results: [{
        rank: 1,
        title: 'Food Truck Application',
        url: 'https://www.eventeny.com/events/vendor/?id=27624&srsltid=tracking-token',
        snippet: ''
      }]
    }],
    existingSources: [{
      id: 'existing',
      source_url: 'https://www.eventeny.com/events/vendor/?id=27624',
      application_url: 'https://www.eventeny.com/events/vendor/?id=27624'
    }]
  });

  assert.equal(normalized.candidates.length, 0);
});

test('compact discovery Workflow output does not emit the full source id array', () => {
  const source = fs.readFileSync(
    new URL('../../cloudflare-texas-acquisition/src/index.js', import.meta.url),
    'utf8'
  );

  assert.match(
    source,
    /source_count:\s*publication\.source_ids\.length/
  );

  assert.doesNotMatch(
    source,
    /source_count:\s*publication\.source_ids\.length,\s*source_ids:\s*publication\.source_ids/
  );
});
