import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  parseSnapshot, serializeSnapshot, assertGitState, validateManifest, planChanges,
  changedFilesFromPorcelain, assertAllowedChanges, assertRequiredHeaders, assertLiveHeaders,
  resultStatus, runSequentialGates, parseDeployments
} = require('../scripts/lib/reviewed-opportunity-publisher.js');

const sha = 'a'.repeat(40);
function row(overrides = {}) {
  return { id: 'opp_1', event_name: 'Approved Market', organiser: 'Approved Organiser', source_url: 'https://example.org/source', application_url: 'https://example.org/apply', quality_status: 'customer_ready', publishable: true, ...overrides };
}
function manifest(overrides = {}) {
  return {
    manifest_version: 1,
    approval: { reviewed: true, approved_for_publish: true, reviewed_by: 'reviewer', reviewed_commit: sha },
    changes: { additions: [], updates: [], removals: [] },
    ...overrides
  };
}

test('snapshot parser and serializer round-trip', () => {
  const value = { total: 1, rows: [row()] };
  assert.deepEqual(parseSnapshot(serializeSnapshot(value)), value);
});

test('publisher accepts only clean attached main matching origin and reviewed commit', () => {
  const valid = { branch: 'main', detached: false, head: sha, originMain: sha, porcelain: '' };
  assert.equal(assertGitState(valid, sha), true);
  assert.throws(() => assertGitState({ ...valid, branch: '' , detached: true }, sha), /detached/);
  assert.throws(() => assertGitState({ ...valid, branch: 'feature' }, sha), /non_main/);
  assert.throws(() => assertGitState({ ...valid, porcelain: ' M file' }, sha), /dirty/);
  assert.throws(() => assertGitState({ ...valid, originMain: 'b'.repeat(40) }, sha), /stale/);
  assert.throws(() => assertGitState(valid, 'c'.repeat(40)), /reviewed_commit_mismatch/);
});

test('manifest approval and customer-ready evidence fail closed', () => {
  assert.equal(validateManifest(manifest(), sha), true);
  assert.throws(() => validateManifest(manifest({ approval: { reviewed: false } }), sha), /not_approved/);
  assert.throws(() => validateManifest(manifest({ changes: { additions: [{ reason: 'x', row: row({ quality_status: 'review', publishable: false }) }], updates: [], removals: [] } }), sha), /non_customer_ready/);
  assert.throws(() => validateManifest(manifest({ changes: { additions: [{ reason: 'x', row: row({ organiser: '' }) }], updates: [], removals: [] } }), sha), /missing_evidence/);
});

test('automatic manifests allow only additions and identity-preserving refreshes from directly fetched approved routes', () => {
  const source = 'https://www.quaysidemarket.co.uk/traders';
  const automatic = manifest({
    approval: { reviewed: true, approved_for_publish: true, reviewed_by: 'PitchList approved-source automation', reviewed_commit: sha, mode: 'approved_source_automatic_addition', policy_version: 1 },
    automation: { removals_allowed: false, updates_allowed: 'identity_refresh_only', max_additions: 1, max_updates: 10 },
    changes: { additions: [{ reason: 'automatic', automation_evidence: { directly_fetched: true, source_evidence_present: true, fetched_at: '2026-08-21T15:00:00Z' }, row: row({ source_url: source, application_url: source, country: 'United Kingdom', jurisdiction: 'GB' }) }], updates: [], removals: [] }
  });
  assert.equal(validateManifest(automatic, sha), true);
  assert.throws(() => validateManifest({ ...automatic, changes: { ...automatic.changes, removals: [{ reason: 'x', source_url: source }] } }, sha), /changes_invalid/);
  assert.throws(() => validateManifest({ ...automatic, changes: { ...automatic.changes, additions: [{ ...automatic.changes.additions[0], row: row({ source_url: 'https://unknown.example/apply', application_url: 'https://unknown.example/apply', country: 'United Kingdom', jurisdiction: 'GB' }) }] } }, sha), /source_not_approved/);
  const existing = automatic.changes.additions[0].row;
  const refresh = { ...automatic, changes: { additions: [], removals: [], updates: [{ reason: 'refresh', match_source_url: source, automation_evidence: { directly_fetched: true, source_evidence_present: true, identity_preserved: true, fetched_at: '2026-08-21T15:00:00Z' }, row: { ...existing, last_checked: '2026-08-21', freshness_status: 'fresh', freshness_age_days: 0, notes: 'Revalidated' } }] } };
  assert.equal(validateManifest(refresh, sha), true);
  assert.equal(planChanges({ rows: [existing] }, refresh).summary.updates.length, 1);
  assert.throws(() => planChanges({ rows: [existing] }, { ...refresh, changes: { ...refresh.changes, updates: [{ ...refresh.changes.updates[0], row: { ...refresh.changes.updates[0].row, event_name: 'Changed identity' } }] } }), /changed_identity/);
});

test('dry-run plan shows exact additions updates removals and counts', () => {
  const existing = [row(), row({ id: 'opp_2', event_name: 'Remove Me', source_url: 'https://remove.example/source' })];
  const changes = {
    additions: [{ reason: 'approved addition', row: row({ id: 'opp_3', event_name: 'Add Me', source_url: 'https://add.example/source' }) }],
    updates: [{ reason: 'approved correction', match_source_url: 'https://example.org/source', row: row({ event_name: 'Updated Market' }) }],
    removals: [{ reason: 'confirmed non-UK', source_url: 'https://remove.example/source' }]
  };
  const plan = planChanges({ rows: existing }, manifest({ changes }));
  assert.equal(plan.summary.before_count, 2);
  assert.equal(plan.summary.after_count, 2);
  assert.deepEqual(plan.rows.map(item => item.event_name), ['Updated Market', 'Add Me']);
  assert.equal(plan.summary.additions[0].reason, 'approved addition');
  assert.equal(plan.summary.updates[0].reason, 'approved correction');
  assert.equal(plan.summary.removals[0].reason, 'confirmed non-UK');
});

test('manifest cannot remove or update missing rows or duplicate an addition', () => {
  assert.throws(() => planChanges({ rows: [row()] }, manifest({ changes: { additions: [], updates: [], removals: [{ reason: 'x', source_url: 'https://missing.example' }] } })), /removal_not_found/);
  assert.throws(() => planChanges({ rows: [row()] }, manifest({ changes: { additions: [], updates: [{ reason: 'x', match_source_url: 'https://missing.example', row: row() }], removals: [] } })), /update_not_found/);
  assert.throws(() => planChanges({ rows: [row()] }, manifest({ changes: { additions: [{ reason: 'x', row: row() }], updates: [], removals: [] } })), /addition_duplicate/);
  assert.throws(() => planChanges({ rows: [row()] }, manifest({ changes: { additions: [{ reason: 'x', row: row({ source_url: 'https://different.example/source' }) }], updates: [], removals: [] } })), /introduces_duplicate/);
});

test('shared-source removals fail closed unless an exact row id is supplied', () => {
  const shared = 'https://example.org/shared-source';
  const rows = [
    row({ id: 'opp_1', event_name: 'Ended Event', source_url: shared }),
    row({ id: 'opp_2', event_name: 'Future Event', source_url: shared })
  ];
  const ambiguous = manifest({ changes: { additions: [], updates: [], removals: [{ reason: 'ended', source_url: shared }] } });
  assert.throws(() => planChanges({ rows }, ambiguous), /removal_ambiguous/);
  const targeted = manifest({ changes: { additions: [], updates: [], removals: [{ reason: 'ended', match_id: 'opp_1', source_url: shared }] } });
  const plan = planChanges({ rows }, targeted);
  assert.equal(plan.summary.before_count, 2);
  assert.equal(plan.summary.after_count, 1);
  assert.deepEqual(plan.rows.map(item => item.id), ['opp_2']);
  assert.equal(plan.summary.removals[0].match_id, 'opp_1');
});

test('diff gate permits only data and expected generated pages', () => {
  const allowed = ['functions/_data/opportunities.mjs', 'public/index.html', 'public/sitemap.xml', 'public/areas/index.html', 'public/areas/cumbria.html'];
  assert.equal(assertAllowedChanges(allowed), true);
  assert.throws(() => assertAllowedChanges([...allowed, 'functions/_lib/stripe.mjs']), /protected_changes/);
  assert.throws(() => assertAllowedChanges([...allowed, 'src/_headers']), /protected_changes/);
  assert.throws(() => assertAllowedChanges(['public/areas/cumbria.html']), /expected_opportunity_snapshot/);
  assert.deepEqual(changedFilesFromPorcelain(' M public/index.html\nR  old -> public/areas/new.html\n'), ['public/index.html', 'public/areas/new.html']);
  assert.deepEqual(changedFilesFromPorcelain('M functions/_data/opportunities.mjs\n M public/index.html\n'), ['functions/_data/opportunities.mjs', 'public/index.html']);
});

test('required headers must match source, generated output and live production', () => {
  const headers = `/*\n  Content-Security-Policy: default-src 'self'\n  X-Frame-Options: DENY\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=()\n`;
  assert.equal(assertRequiredHeaders(headers, headers), true);
  assert.throws(() => assertRequiredHeaders(headers, `${headers}extra`), /mismatch/);
  assert.equal(assertLiveHeaders(headers), true);
  assert.throws(() => assertLiveHeaders('HTTP/2 200'), /live_security_header_missing/);
});

test('spawn errors, signals, null status and nonzero codes fail the publishing sequence', () => {
  for (const result of [{ error: new Error('spawn') }, { signal: 'SIGTERM', status: null }, { status: null }, { status: 7 }]) {
    assert.throws(() => resultStatus(result, 'gate'), /gate_failed/);
  }
  assert.equal(resultStatus({ status: 0 }, 'gate').status, 0);
});

test('a failed gate prevents Git push and deployment from running', () => {
  const calls = [];
  assert.throws(() => runSequentialGates([
    { label: 'generation', run: () => { calls.push('generation'); return { status: 0 }; } },
    { label: 'tests', run: () => { calls.push('tests'); return { status: 9 }; } },
    { label: 'git_push', run: () => { calls.push('git_push'); return { status: 0 }; } },
    { label: 'wrangler_deploy', run: () => { calls.push('wrangler_deploy'); return { status: 0 }; } }
  ]), /tests_failed/);
  assert.deepEqual(calls, ['generation', 'tests']);
});

test('Cloudflare deployment metadata captures rollback and deployed identifiers', () => {
  assert.deepEqual(parseDeployments(JSON.stringify([{ Id: 'dep-1', Environment: 'Production', Branch: 'main', Source: 'abcdef0', Deployment: 'https://dep-1.example' }])), { id: 'dep-1', url: 'https://dep-1.example', source: 'abcdef0', branch: 'main' });
  assert.throws(() => parseDeployments('[]'), /metadata_missing/);
  assert.throws(() => parseDeployments(JSON.stringify([{ Id: 'dep-1', Environment: 'Production', Deployment: 'https://dep-1.example' }])), /metadata_missing/);
});
