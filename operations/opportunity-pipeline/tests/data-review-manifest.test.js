const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../reviews/opportunity-data-review-2026-08-21.json'), 'utf8'));

test('data-review manifest is complete, unapproved and count-consistent', () => {
  assert.equal(manifest.approval.approved_for_publish, false);
  assert.equal(manifest.proposed_removals.length, 29);
  assert.equal(manifest.proposed_removals.filter(row => row.reason.startsWith('confirmed_non_uk_')).length, 22);
  assert.equal(manifest.proposed_additions.length, 2);
  assert.equal(manifest.classified_non_additions.length, 10);
  assert.equal(manifest.classified_non_additions.filter(row => row.type === 'general_council_licence_or_permission_information').length, 9);
  assert.equal(manifest.repair_candidates.length, 17);
  assert.equal(manifest.dirty_snapshot_missing_production_rows.length, 9);
  assert.equal(manifest.dirty_snapshot_duplicate_ordinals.length, 8);
  assert.equal(manifest.dirty_snapshot_rejected_ordinals.length, 21);
  assert.equal(manifest.coverage_projection.before - manifest.coverage_projection.remove + manifest.coverage_projection.add_if_both_genuine_candidates_are_approved, manifest.coverage_projection.after);
  assert.equal(manifest.controlled_staging_run.genuinely_new_customer_ready, 0);
  assert.equal(manifest.controlled_staging_run.north_east_genuine_opportunities, 0);
});

test('every proposed addition has an official source and application/contact evidence', () => {
  for (const row of manifest.proposed_additions) {
    assert.match(row.source_url, /^https:\/\//);
    assert.match(row.application_or_contact_url, /^https:\/\//);
    assert.ok(row.organiser);
    assert.ok(row.area);
    assert.match(row.evidence, /official/i);
    assert.equal(row.type, 'open_event_market_or_festival_trader_application');
    assert.equal(row.status, 'candidate_pending_explicit_approval');
  }
});

test('council permissions and closed pitches are never proposed as live additions', () => {
  assert.equal(manifest.proposed_additions.some(row => /licen[cs]e|consent|permit/i.test(`${row.name} ${row.evidence}`)), false);
  assert.equal(manifest.classified_non_additions.some(row => row.reason.includes('closed until further notice')), true);
});
