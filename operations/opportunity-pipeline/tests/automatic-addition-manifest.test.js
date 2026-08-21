const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAutomaticAdditionManifest } = require('../../../scripts/build-automatic-addition-manifest');

function staged(overrides = {}) {
  return { stable_id: 'opp_new', event_name: 'Quayside Market Sheffield trader applications', organiser: 'Quayside Market Sheffield', source_url: 'https://www.quaysidemarket.co.uk/traders', application_url: 'https://www.quaysidemarket.co.uk/traders', location: 'South Yorkshire', region: 'South Yorkshire', vendor_categories: 'food traders; stallholders', last_checked: '2026-08-21', confidence: 'medium', source_evidence: 'Official page: apply to become a trader at Victoria Quays Sheffield.', quality_status: 'customer_ready', publishable: 'true', ...overrides };
}
const report = { mode: 'direct-approved-source-fetch', serper_credits_used: 0, generated_at: '2026-08-21T15:00:00Z', fetched_urls: ['https://www.quaysidemarket.co.uk/traders'] };

test('automatic manifest emits only genuinely new approved direct-fetch additions', () => {
  const manifest = buildAutomaticAdditionManifest({ snapshot: { exported_at: 'x', rows: [] }, rows: [staged()], directReport: report, reviewedCommit: 'a'.repeat(40), today: '2026-08-21', maxAdditions: 1 });
  assert.equal(manifest.changes.additions.length, 1);
  assert.deepEqual(manifest.changes.updates, []);
  assert.deepEqual(manifest.changes.removals, []);
  assert.equal(manifest.changes.additions[0].row.country, 'United Kingdom');
  assert.equal(manifest.changes.additions[0].automation_evidence.directly_fetched, true);
});

test('automatic manifest rejects duplicates, non-ready rows and missing fetch attestation', () => {
  const existing = { event_name: 'Quayside Market Sheffield trader applications', organiser: 'Quayside Market Sheffield', source_url: 'https://quaysidemarket.co.uk/traders', application_url: 'https://quaysidemarket.co.uk/traders' };
  const duplicate = buildAutomaticAdditionManifest({ snapshot: { exported_at: 'x', rows: [existing] }, rows: [staged()], directReport: report, reviewedCommit: 'a'.repeat(40), today: '2026-08-21' });
  assert.equal(duplicate.changes.additions.length, 0);
  const held = buildAutomaticAdditionManifest({ snapshot: { exported_at: 'x', rows: [] }, rows: [staged({ quality_status: 'review', publishable: 'false' })], directReport: report, reviewedCommit: 'a'.repeat(40), today: '2026-08-21' });
  assert.equal(held.changes.additions.length, 0);
  assert.throws(() => buildAutomaticAdditionManifest({ snapshot: { rows: [] }, rows: [staged()], directReport: { ...report, serper_credits_used: 1 }, reviewedCommit: 'a'.repeat(40), today: '2026-08-21' }), /attestation/);
});
