import test from 'node:test';
import assert from 'node:assert/strict';

import { planPublicationBatch } from '../../platform/findpitches-v2/publisher/plan.mjs';

function fakeDb(rows) {
  return {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async all() {
              assert.match(sql, /status = 'validated'/);
              assert.equal(values[0], 'GB');
              assert.equal(values[1], 60);
              return { results: rows };
            }
          };
        }
      };
    }
  };
}

test('publication plan is additions-only and market bounded', async () => {
  const plan = await planPublicationBatch(fakeDb([
    {
      id: 'a',
      market: 'GB',
      region_code: 'GB-ENG-KENT',
      source_url: 'https://example.test/source',
      canonical_url: 'https://example.test/source',
      application_url: 'https://example.test/apply',
      event_name: 'Example Event',
      organiser: 'Example Org',
      geography_json: '{"country_code":"GB","region_code":"GB-ENG-KENT"}',
      evidence_json: '[{"type":"application_phrase","value":"vendors wanted","confidence":1}]',
      score: 80,
      status: 'validated',
      rejection_reason: null,
      opportunity_fingerprint: 'abc'
    }
  ]), { market: 'GB' });

  assert.equal(plan.mode, 'dry_run');
  assert.equal(plan.additions_only, true);
  assert.equal(plan.market, 'GB');
  assert.equal(plan.candidate_count, 1);
  assert.deepEqual(plan.candidate_ids, ['a']);
});
