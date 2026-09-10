import test from 'node:test';
import assert from 'node:assert/strict';
import { proveUsOpportunitySnapshotAdditionsOnly } from '../operations/cloudflare-global-acquisition/lib/us-opportunity-snapshot-diff-proof.mjs';

function base() {
  return {
    exported_at: 'old', source: 'old-source', total: 2,
    rows: [
      { stable_id: 'opp_a', event_name: 'A', region_code: 'TX' },
      { stable_id: 'opp_b', event_name: 'B', region_code: 'TX' }
    ]
  };
}
function head() {
  return {
    exported_at: 'new', source: 'new-source', total: 3,
    rows: [...base().rows, { stable_id: 'opp_c', event_name: 'C', region_code: 'TX' }]
  };
}

test('US snapshot proof permits only exact existing rows plus new unique opportunity identities', () => {
  assert.deepEqual(proveUsOpportunitySnapshotAdditionsOnly(base(), head()), {
    additions_only: true,
    base_count: 2,
    head_count: 3,
    added_count: 1,
    added_ids: ['opp_c']
  });
});

test('US snapshot proof rejects existing-row rewrites and removals', () => {
  const modified = head();
  modified.rows[0] = { ...modified.rows[0], event_name: 'Changed' };
  assert.throws(() => proveUsOpportunitySnapshotAdditionsOnly(base(), modified), /opportunity_modified:opp_a/);

  const removed = head();
  removed.rows = removed.rows.filter(row => row.stable_id !== 'opp_b');
  removed.total = removed.rows.length;
  assert.throws(() => proveUsOpportunitySnapshotAdditionsOnly(base(), removed), /opportunity_removed:opp_b/);
});

test('US snapshot proof rejects duplicates, malformed counts, envelope changes and zero-addition PRs', () => {
  const duplicate = head();
  duplicate.rows.push({ ...duplicate.rows[2] });
  duplicate.total = duplicate.rows.length;
  assert.throws(() => proveUsOpportunitySnapshotAdditionsOnly(base(), duplicate), /duplicate_identity/);

  const badCount = head();
  badCount.total = 99;
  assert.throws(() => proveUsOpportunitySnapshotAdditionsOnly(base(), badCount), /count_invalid/);

  const envelope = head();
  envelope.unexpected = true;
  assert.throws(() => proveUsOpportunitySnapshotAdditionsOnly(base(), envelope), /envelope_invalid/);

  const zero = base();
  zero.exported_at = 'new';
  zero.source = 'new-source';
  assert.throws(() => proveUsOpportunitySnapshotAdditionsOnly(base(), zero), /no_additions/);
});
