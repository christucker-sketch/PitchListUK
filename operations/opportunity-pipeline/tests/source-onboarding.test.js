'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  STATUS, classifySourceCandidate, upsertCandidateRegistry, buildSourcePromotionManifest,
  validateSourcePromotionManifest, manifestHash
} = require('../lib/source-onboarding');
const { applyManifest } = require('../scripts/apply-source-promotion-manifest');

function candidate(overrides = {}) {
  return {
    url: 'https://example.gov.uk/markets/apply-stall', organisation: 'Example Council',
    geographic_coverage: 'Examplefordshire', opportunity_type: 'recurring_market',
    page_text: 'Our market has pitches available. Apply for a market stall and become a trader.',
    first_party_evidence: 'Official Example Council service page', robots_result: 'allowed',
    terms_review_status: 'public-service', fetch_status: 'fetched', ...overrides
  };
}

test('unambiguous public-service trader route is auto-approvable but not automatically published', () => {
  const result = classifySourceCandidate(candidate(), { now: '2026-08-26T10:00:00Z' });
  assert.equal(result.classification, STATUS.AUTO);
  assert.equal(result.approval_status, 'pending');
  assert.equal(result.source_path_prefix, '/markets/apply-stall');
});

test('private first-party organisers require a reviewed decision', () => {
  const result = classifySourceCandidate(candidate({ url: 'https://goodfoodfestival.co.uk/traders/apply', organisation: 'Good Food Festival', terms_review_status: 'manual-review-required' }));
  assert.equal(result.classification, STATUS.REVIEW);
  assert.match(result.rejection_reason, /requires_review/);
});

test('aggregators, licence-only pages, foreign pages and pages without live routes are rejected distinctly', () => {
  assert.equal(classifySourceCandidate(candidate({ url: 'https://events.example.co.uk/listing', page_text: 'Events directory and listing site for market visitors' })).classification, STATUS.AGGREGATOR);
  assert.equal(classifySourceCandidate(candidate({ page_text: 'Apply for a street trading licence or street trader consent.' })).classification, STATUS.LICENCE);
  assert.equal(classifySourceCandidate(candidate({ url: 'https://festival.example.com/vendors', page_text: 'Vendor application for a food festival in Texas USA' })).classification, STATUS.FOREIGN);
  assert.equal(classifySourceCandidate(candidate({ page_text: 'Visit our historic market every Saturday.' })).classification, STATUS.NO_ROUTE);
});

test('known platforms are rejected deterministically before evidence heuristics', () => {
  const result = classifySourceCandidate(candidate({ url: 'https://www.youtube.com/watch?v=abc', page_text: 'Apply to become a market trader in England.' }));
  assert.equal(result.classification, STATUS.AGGREGATOR);
  assert.equal(result.rejection_reason, 'platform_route_rejected');
});

test('owned and known denied hosts cannot enter first-party review', () => {
  for (const url of ['https://pitchlist.uk/areas/south-west', 'https://festfinder.co.uk/traders', 'https://pitchmarketsandeventsuk.com/become-a-trader']) {
    const result = classifySourceCandidate(candidate({ url, page_text: 'Apply to become a food festival trader in England.' }));
    assert.equal(result.classification, STATUS.AGGREGATOR);
    assert.equal(result.rejection_reason, 'known_non_first_party_route_rejected');
  }
});

test('approved routes are suppressed as duplicate candidates', () => {
  const result = classifySourceCandidate(candidate({ url: 'https://quaysidemarket.co.uk/traders' }));
  assert.equal(result.classification, STATUS.DUPLICATE);
});

test('candidate registry preserves reviewer decisions and suppresses unchanged candidates until recheck', () => {
  const classified = classifySourceCandidate(candidate(), { now: '2026-08-26T10:00:00Z' });
  const first = upsertCandidateRegistry([], [classified], { now: '2026-08-26T10:00:00Z' });
  assert.equal(first.added, 1);
  const decided = [{ ...first.records[0], approval_status: 'rejected', reviewer_decision: 'not commercially useful', reviewer: 'Chris', decision_timestamp: '2026-08-26T11:00:00Z' }];
  const second = upsertCandidateRegistry(decided, [classified], { now: '2026-08-27T10:00:00Z' });
  assert.equal(second.skipped, 1);
  assert.equal(second.records[0].approval_status, 'rejected');
});

test('reviewed promotion manifest is hash-bound, SHA-bound, addition-only and exact-count bound', () => {
  const approved = { ...classifySourceCandidate(candidate()), approval_status: 'approved', reviewer_decision: 'approved exact public-service route', recurring: true, opportunity_title: 'Example Market trader applications' };
  const manifest = buildSourcePromotionManifest({ candidates: [approved], reviewedCommit: 'a'.repeat(40), reviewer: 'Chris Tucker', expectedSourceCount: 57, now: '2026-08-26T12:00:00Z' });
  assert.equal(manifest.expected_source_count_after, 58);
  assert.equal(manifest.removals_allowed, false);
  assert.equal(validateSourcePromotionManifest(manifest, { reviewedCommit: 'a'.repeat(40), currentSourceCount: 57 }), true);
  assert.throws(() => validateSourcePromotionManifest({ ...manifest, reviewer: 'tampered' }, { reviewedCommit: 'a'.repeat(40), currentSourceCount: 57 }), /hash_mismatch/);
  assert.throws(() => validateSourcePromotionManifest(manifest, { reviewedCommit: 'b'.repeat(40), currentSourceCount: 57 }), /sha_mismatch/);
  assert.throws(() => validateSourcePromotionManifest(manifest, { reviewedCommit: 'a'.repeat(40), currentSourceCount: 58 }), /source_count_mismatch/);
  assert.equal(manifest.manifest_hash, manifestHash(manifest));
  const routes = applyManifest(manifest, [], { reviewedCommit: 'a'.repeat(40), currentSourceCount: 57 });
  assert.equal(routes.length, 1);
  assert.equal(routes[0].approval_manifest_hash, manifest.manifest_hash);
});
