import test from 'node:test';
import assert from 'node:assert/strict';
import { TEXAS_PILOT_REVIEWED_OPPORTUNITIES } from '../config/texas-pilot-reviewed-opportunities.js';

test('all reviewed Texas pilot opportunities are staging decisions only', () => {
  assert.equal(TEXAS_PILOT_REVIEWED_OPPORTUNITIES.length, 6);
  for (const item of TEXAS_PILOT_REVIEWED_OPPORTUNITIES) {
    assert.equal(item.decision, 'stage');
    assert.ok(item.source_id.startsWith('tx-'));
    assert.ok(item.notes);
  }
});
