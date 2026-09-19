import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeCandidate } from '../../platform/findpitches-v2/engine/candidate.mjs';

test('candidate model strips tracking and preserves one global shape', () => {
  const candidate = normalizeCandidate({
    candidate_id: 'cand-1',
    market: 'GB',
    source_url: 'https://example.test/apply?utm_source=x&gclid=123&keep=yes#section',
    event_name: 'Example Market',
    organiser: 'Example Council',
    geography: { region: 'England', subregion: 'Kent', locality: 'Maidstone' },
    categories: ['market', 'market'],
    evidence: [{ type: 'application_phrase', value: 'Apply to trade', confidence: 1 }],
    score: 80,
    status: 'validated'
  });

  assert.equal(candidate.market, 'GB');
  assert.equal(candidate.source_url, 'https://example.test/apply?keep=yes');
  assert.deepEqual(candidate.categories, ['market']);
  assert.equal(candidate.geography.country_code, 'GB');
  assert.equal(candidate.status, 'validated');
});
