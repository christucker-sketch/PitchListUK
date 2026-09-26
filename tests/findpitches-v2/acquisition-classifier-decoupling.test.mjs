import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import { discoverBatch } from '../../platform/findpitches-v2/acquisition/discover-batch.mjs';

test('acquisition discovery does not require or invoke classification', async () => {
  let searches = 0;

  const result = await discoverBatch({
    market: 'GB',
    region_code: 'GB-ENG-KENT',
    location: 'Kent',
    query_limit: 1
  }, {
    searchProvider: {
      async search() {
        searches += 1;
        return [{ url: 'https://example.test/vendors', title: 'Vendor applications' }];
      }
    }
  });

  assert.equal(searches, 1);
  assert.equal(result.engine, 'findpitches-v2-acquisition');
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].status, 'discovered');
  assert.equal(result.candidates[0].discovery_market, 'GB');
});

test('runtime schedules acquisition and classifier as independent lanes', async () => {
  const worker = await fs.readFile(
    new URL('../../operations/findpitches-v2/worker/index.mjs', import.meta.url),
    'utf8'
  );
  const config = await fs.readFile(
    new URL('../../operations/findpitches-v2/wrangler.jsonc', import.meta.url),
    'utf8'
  );

  assert.match(worker, /runClassifierTick/);
  assert.match(worker, /enqueueStaleClassifications/);
  assert.match(worker, /classifier_ruleset_version/);
  assert.match(worker, /c\.status IN \('validated', 'held'\)/);
  assert.match(worker, /RECLASSIFY_BATCH_LIMIT = 24/);
  assert.match(worker, /CLASSIFIER_BATCH_LIMIT = 24/);
  assert.match(worker, /runShadowTick/);
  assert.match(worker, /event\?\.cron === CLASSIFIER_CRON/);
  assert.match(config, /"\*\/5 \* \* \* \*"/);
  assert.match(config, /"\* \* \* \* \*"/);
});
