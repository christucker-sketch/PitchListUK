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

test('diff gate permits only data and expected generated pages', () => {
  const allowed = ['functions/_data/opportunities.mjs', 'public/index.html', 'public/sitemap.xml', 'public/areas/index.html', 'public/areas/cumbria.html'];
  assert.equal(assertAllowedChanges(allowed), true);
  assert.throws(() => assertAllowedChanges([...allowed, 'functions/_lib/stripe.mjs']), /protected_changes/);
  assert.throws(() => assertAllowedChanges([...allowed, 'src/_headers']), /protected_changes/);
  assert.throws(() => assertAllowedChanges(['public/areas/cumbria.html']), /expected_opportunity_snapshot/);
  assert.deepEqual(changedFilesFromPorcelain(' M public/index.html\nR  old -> public/areas/new.html\n'), ['public/index.html', 'public/areas/new.html']);
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
