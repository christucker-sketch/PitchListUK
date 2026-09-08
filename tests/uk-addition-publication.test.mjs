import assert from 'node:assert/strict';
import test from 'node:test';

import sourcesLib from '../operations/opportunity-pipeline/config/sources.js';
import publicationLib from '../operations/opportunity-pipeline/lib/uk-addition-publication.js';

const { APPROVED_SOURCES, termsReviewed } = sourcesLib;
const {
  applyAutomaticAdditionManifest,
  buildAutomaticAdditionManifest
} = publicationLib;

function approvedSource() {
  const source = APPROVED_SOURCES.find(item => item.approved === true && item.official_application_route && termsReviewed(item));
  assert.ok(source, 'expected at least one approved direct UK source');
  return source;
}

function approvedSources(count = 2) {
  const sources = APPROVED_SOURCES.filter(item => item.approved === true && item.official_application_route && termsReviewed(item));
  assert.ok(sources.length >= count, `expected at least ${count} approved direct UK sources`);
  return sources.slice(0, count);
}

function stagedRow(source, overrides = {}) {
  return {
    stable_id: '',
    event_name: source.opportunity_title || `${source.organisation} trader opportunity`,
    organiser: source.organisation,
    source_url: source.official_application_route,
    application_url: source.official_application_route,
    source_evidence: 'Apply to trade. Trader applications are open.',
    location: source.geographic_coverage || 'United Kingdom',
    region: source.geographic_coverage || 'United Kingdom',
    event_start: '',
    event_end: '',
    application_deadline: '',
    stall_fee: '',
    vendor_categories: 'food traders; stallholders',
    last_checked: '2026-09-08',
    confidence: 'high',
    quality_status: 'customer_ready',
    publishable: true,
    ...overrides
  };
}

function directReport(source) {
  return {
    mode: 'direct-approved-source-fetch',
    generated_at: '2026-09-08T16:10:00.000Z',
    serper_credits_used: 0,
    fetched_urls: [source.official_application_route]
  };
}

test('UK automatic publication builds and applies additions only', () => {
  const source = approvedSource();
  const snapshot = { exported_at: '2026-09-01T00:00:00.000Z', source: 'baseline', total: 0, rows: [] };
  const manifest = buildAutomaticAdditionManifest({
    snapshot,
    rows: [stagedRow(source)],
    directReport: directReport(source),
    reviewedCommit: 'a'.repeat(40),
    today: '2026-09-08'
  });
  assert.equal(manifest.changes.additions.length, 1);
  assert.deepEqual(manifest.changes.updates, []);
  assert.deepEqual(manifest.changes.removals, []);
  const next = applyAutomaticAdditionManifest(snapshot, manifest, { generated_at: '2026-09-08T16:10:00.000Z' });
  assert.equal(next.total, 1);
  assert.equal(next.rows.length, 1);
  assert.equal(next.rows[0].country, 'United Kingdom');
  assert.equal(next.rows[0].jurisdiction, 'GB');
  assert.equal(next.rows[0].currency, 'GBP');
  assert.equal(next.rows[0].publishable, true);
});

test('existing UK source route is held rather than rewritten', () => {
  const source = approvedSource();
  const existing = stagedRow(source, { id: 'existing', quality_status: 'customer_ready', publishable: true });
  const snapshot = { exported_at: '2026-09-01T00:00:00.000Z', source: 'baseline', total: 1, rows: [existing] };
  const manifest = buildAutomaticAdditionManifest({
    snapshot,
    rows: [stagedRow(source, { event_name: 'Changed title that must not update production' })],
    directReport: directReport(source),
    reviewedCommit: 'b'.repeat(40),
    today: '2026-09-08'
  });
  assert.equal(manifest.changes.additions.length, 0);
  assert.equal(manifest.automation.held_existing_routes.length, 1);
  assert.equal(manifest.automation.held_existing_routes[0].reason, 'existing_route_update_forbidden_by_addition_only_policy');
});

test('duplicate-only eligible UK rows become a safe zero-addition manifest', () => {
  const [existingSource, candidateSource] = approvedSources(2);
  const duplicateIdentity = {
    event_name: 'Shared Market Identity',
    organiser: 'Shared Market Organiser',
    location: 'Kent',
    region: 'Kent',
    event_start: ''
  };
  const existing = stagedRow(existingSource, { id: 'existing', ...duplicateIdentity });
  const candidate = stagedRow(candidateSource, duplicateIdentity);
  const snapshot = { exported_at: '2026-09-01T00:00:00.000Z', source: 'baseline', total: 1, rows: [existing] };
  const manifest = buildAutomaticAdditionManifest({
    snapshot,
    rows: [candidate],
    directReport: directReport(candidateSource),
    reviewedCommit: 'd'.repeat(40),
    today: '2026-09-08',
    maxDuplicateRate: 60
  });
  assert.equal(manifest.changes.additions.length, 0);
  assert.equal(manifest.automation.observed_duplicate_rate, 100);
  assert.equal(manifest.automation.held_existing_routes.length, 1);
  assert.equal(manifest.automation.held_existing_routes[0].reason, 'duplicate_identity_already_in_production');
});

test('UK automatic publication requires direct zero-Serper attestation', () => {
  const source = approvedSource();
  const snapshot = { exported_at: '2026-09-01T00:00:00.000Z', source: 'baseline', total: 0, rows: [] };
  assert.throws(() => buildAutomaticAdditionManifest({
    snapshot,
    rows: [stagedRow(source)],
    directReport: { ...directReport(source), serper_credits_used: 1 },
    reviewedCommit: 'c'.repeat(40),
    today: '2026-09-08'
  }), /direct_fetch_attestation_required/);
});

test('UK snapshot application rejects updates and removals', () => {
  const snapshot = { exported_at: '2026-09-01T00:00:00.000Z', source: 'baseline', total: 0, rows: [] };
  const baseManifest = {
    created_at: '2026-09-08T16:10:00.000Z',
    baseline: { production_count: 0 },
    changes: { additions: [], updates: [], removals: [] }
  };
  assert.throws(() => applyAutomaticAdditionManifest(snapshot, {
    ...baseManifest,
    changes: { ...baseManifest.changes, updates: [{}] }
  }), /updates_forbidden/);
  assert.throws(() => applyAutomaticAdditionManifest(snapshot, {
    ...baseManifest,
    changes: { ...baseManifest.changes, removals: [{}] }
  }), /removals_forbidden/);
});
