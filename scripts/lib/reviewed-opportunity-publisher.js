'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { duplicateKeys } = require('../../operations/opportunity-pipeline/lib/opportunity-safety');
const { sourceRuleFor, termsReviewed } = require('../../operations/opportunity-pipeline/config/sources');

const REQUIRED_HEADERS = [
  'Content-Security-Policy:', 'X-Frame-Options: DENY', 'X-Content-Type-Options: nosniff',
  'Referrer-Policy: strict-origin-when-cross-origin', 'Permissions-Policy:'
];
const ALLOWED_CHANGE = /^(functions\/_data\/opportunities\.mjs|public\/index\.html|public\/sitemap\.xml|public\/areas\/[a-z0-9-]+\.html)$/;
const PROTECTED_CHANGE = /^(functions\/|src\/|scripts\/|tests\/|\.github\/|public\/(?:analytics\.js|database\.js|styles\.css|_headers))/;

function canonicalUrl(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    for (const key of [...url.searchParams.keys()]) if (/^(utm_.+|gclid|fbclid|ref|source|campaign)$/i.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    return url.toString().replace(/\/$/, '');
  } catch { return ''; }
}

function parseSnapshot(source) {
  return JSON.parse(String(source).replace(/^export const opportunitySnapshot = /, '').replace(/;\s*$/, ''));
}

function serializeSnapshot(snapshot) {
  return `export const opportunitySnapshot = ${JSON.stringify(snapshot, null, 2)};\n`;
}

function assertGitState(state, reviewedCommit) {
  if (state.detached || !state.branch) throw new Error('publisher_refused_detached_worktree');
  if (state.branch !== 'main') throw new Error('publisher_refused_non_main_branch');
  if (String(state.porcelain || '').trim()) throw new Error('publisher_refused_dirty_worktree');
  if (!state.head || state.head !== state.originMain) throw new Error('publisher_refused_stale_main');
  if (!reviewedCommit || state.head !== reviewedCommit) throw new Error('publisher_refused_reviewed_commit_mismatch');
  return true;
}

function validateManifest(manifest, reviewedCommit) {
  if (!manifest || manifest.manifest_version !== 1) throw new Error('manifest_invalid_version');
  if (manifest.approval?.reviewed !== true || manifest.approval?.approved_for_publish !== true) throw new Error('manifest_not_approved');
  if (!manifest.approval?.reviewed_by) throw new Error('manifest_reviewer_missing');
  if (manifest.approval?.reviewed_commit !== reviewedCommit) throw new Error('manifest_reviewed_commit_mismatch');
  const changes = manifest.changes;
  if (!changes || !Array.isArray(changes.additions) || !Array.isArray(changes.updates) || !Array.isArray(changes.removals)) throw new Error('manifest_changes_invalid');
  for (const item of [...changes.additions, ...changes.updates]) {
    const row = item.row;
    if (!item.reason || !row || row.quality_status !== 'customer_ready' || row.publishable !== true) throw new Error('manifest_contains_non_customer_ready_change');
    if (!row.event_name || !row.organiser || !canonicalUrl(row.source_url) || !canonicalUrl(row.application_url || row.source_url)) throw new Error('manifest_change_missing_evidence');
  }
  for (const item of changes.removals) {
    if (!item.reason || !canonicalUrl(item.source_url) || (item.match_id !== undefined && !String(item.match_id).trim())) throw new Error('manifest_removal_invalid');
  }
  if (manifest.approval?.mode === 'approved_source_automatic_addition') {
    if (![1, 2].includes(manifest.approval?.policy_version) || manifest.approval?.reviewed_by !== 'PitchList approved-source automation') throw new Error('automatic_manifest_policy_invalid');
    if (changes.removals.length || manifest.automation?.removals_allowed !== false || manifest.automation?.updates_allowed !== 'identity_refresh_only') throw new Error('automatic_manifest_changes_invalid');
    const limit = Number(manifest.automation?.max_additions || 0);
    if (!Number.isInteger(limit) || limit < 1 || changes.additions.length > limit) throw new Error('automatic_manifest_addition_limit_invalid');
    const updateLimit = Number(manifest.automation?.max_updates || 0);
    if (!Number.isInteger(updateLimit) || updateLimit < 1 || changes.updates.length > updateLimit) throw new Error('automatic_manifest_update_limit_invalid');
    if (manifest.approval.policy_version >= 2) {
      const growthPercent = Number(manifest.automation?.max_growth_percent);
      const perSource = Number(manifest.automation?.max_per_source);
      const duplicateRate = Number(manifest.automation?.max_duplicate_rate);
      if (!(growthPercent > 0 && growthPercent <= 100) || !Number.isInteger(perSource) || perSource < 1 || !(duplicateRate >= 0 && duplicateRate <= 100)) throw new Error('automatic_manifest_growth_controls_invalid');
    }
    for (const item of [...changes.additions, ...changes.updates]) {
      const row = item.row;
      const rule = sourceRuleFor(row.source_url);
      if (!rule.approved || !termsReviewed(rule) || canonicalUrl(rule.official_application_route) !== canonicalUrl(row.source_url)) throw new Error('automatic_manifest_source_not_approved');
      if (row.country !== 'United Kingdom' || row.jurisdiction !== 'GB' || !row.source_url || !row.application_url || !item.automation_evidence?.directly_fetched || !item.automation_evidence?.source_evidence_present || !item.automation_evidence?.fetched_at) throw new Error('automatic_manifest_evidence_invalid');
    }
    for (const item of changes.updates) if (canonicalUrl(item.match_source_url) !== canonicalUrl(item.row.source_url) || item.automation_evidence?.identity_preserved !== true) throw new Error('automatic_manifest_refresh_identity_invalid');
  }
  return true;
}

function planChanges(snapshot, manifest) {
  const existing = snapshot.rows || [];
  const removalIndexes = new Map();
  for (const item of manifest.changes.removals) {
    const sourceKey = canonicalUrl(item.source_url);
    const matches = existing
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => canonicalUrl(row.source_url) === sourceKey && (item.match_id === undefined || String(row.id) === String(item.match_id)));
    if (!matches.length) throw new Error(`manifest_removal_not_found:${sourceKey}`);
    if (matches.length > 1) throw new Error(`manifest_removal_ambiguous:${sourceKey}`);
    if (removalIndexes.has(matches[0].index)) throw new Error(`manifest_removal_duplicate:${sourceKey}`);
    removalIndexes.set(matches[0].index, item);
  }
  const updateMap = new Map(manifest.changes.updates.map(item => [canonicalUrl(item.match_source_url || item.row.source_url), item]));
  const seenUpdate = new Set();
  const rows = [];
  for (const [index, row] of existing.entries()) {
    const key = canonicalUrl(row.source_url);
    if (removalIndexes.has(index)) continue;
    if (updateMap.has(key)) {
      const update = updateMap.get(key);
      if (manifest.approval?.mode === 'approved_source_automatic_addition') {
        const allowed = new Set(['last_checked', 'freshness_status', 'freshness_age_days', 'quality_status', 'publishable', 'notes']);
        const changed = new Set([...Object.keys(row), ...Object.keys(update.row)].filter(field => JSON.stringify(row[field]) !== JSON.stringify(update.row[field])));
        if ([...changed].some(field => !allowed.has(field))) throw new Error(`automatic_manifest_refresh_changed_identity:${[...changed].join(',')}`);
      }
      rows.push(update.row); seenUpdate.add(key); continue;
    }
    rows.push(row);
  }
  for (const key of updateMap.keys()) if (!seenUpdate.has(key)) throw new Error(`manifest_update_not_found:${key}`);
  const sourceKeys = new Set(rows.map(row => canonicalUrl(row.source_url)));
  for (const item of manifest.changes.additions) {
    const key = canonicalUrl(item.row.source_url);
    if (sourceKeys.has(key)) throw new Error(`manifest_addition_duplicate:${key}`);
    sourceKeys.add(key);
    rows.push(item.row);
  }
  const countKeys = inputRows => {
    const counts = new Map();
    for (const row of inputRows) for (const key of duplicateKeys(row)) counts.set(key, (counts.get(key) || 0) + 1);
    return counts;
  };
  const beforeDuplicateCounts = countKeys(existing);
  const afterDuplicateCounts = countKeys(rows);
  for (const [key, count] of afterDuplicateCounts) {
    if (count > Math.max(1, beforeDuplicateCounts.get(key) || 0)) throw new Error(`manifest_introduces_duplicate:${key}`);
  }
  const summary = {
    before_count: existing.length,
    after_count: rows.length,
    additions: manifest.changes.additions.map(item => ({ event_name: item.row.event_name, source_url: item.row.source_url, reason: item.reason })),
    updates: manifest.changes.updates.map(item => ({ event_name: item.row.event_name, source_url: item.row.source_url, reason: item.reason })),
    removals: manifest.changes.removals.map(item => ({ match_id: item.match_id || '', source_url: item.source_url, reason: item.reason }))
  };
  return { rows, summary };
}

function changedFilesFromPorcelain(output) {
  return String(output || '').split(/\r?\n/).filter(Boolean).map(line => {
    // Trimming the complete command output can remove the first line's
    // leading worktree-status space (` M file` becomes `M file`). Accept
    // canonical porcelain and that safely-trimmed first-line form.
    const canonical = line.match(/^[ MARCUD?!]{2}\s+(.*)$/);
    const trimmedFirstLine = line.match(/^[MARCUD?!]\s+(.*)$/);
    return (canonical?.[1] || trimmedFirstLine?.[1] || line).trim();
  }).map(file => file.includes(' -> ') ? file.split(' -> ').at(-1) : file);
}

function assertAllowedChanges(files) {
  const rejected = files.filter(file => !ALLOWED_CHANGE.test(file));
  if (rejected.length) {
    const protectedFiles = rejected.filter(file => PROTECTED_CHANGE.test(file));
    throw new Error(`${protectedFiles.length ? 'publisher_refused_protected_changes' : 'publisher_refused_unexpected_changes'}:${rejected.join(',')}`);
  }
  if (!files.includes('functions/_data/opportunities.mjs')) throw new Error('publisher_expected_opportunity_snapshot_change');
  return true;
}

function assertRequiredHeaders(sourceHeaders, generatedHeaders) {
  if (sourceHeaders !== generatedHeaders) throw new Error('security_headers_source_generated_mismatch');
  for (const header of REQUIRED_HEADERS) if (!sourceHeaders.includes(header)) throw new Error(`required_security_header_missing:${header}`);
  return true;
}

function assertLiveHeaders(headers) {
  const normalised = String(headers || '').toLowerCase();
  for (const header of ['content-security-policy:', 'x-frame-options: deny', 'x-content-type-options: nosniff', 'referrer-policy: strict-origin-when-cross-origin', 'permissions-policy:']) {
    if (!normalised.includes(header)) throw new Error(`live_security_header_missing:${header}`);
  }
  return true;
}

function resultStatus(result, label) {
  if (result?.error || result?.signal || !Number.isInteger(result?.status) || result.status !== 0) throw new Error(`${label}_failed`);
  return result;
}

function runSequentialGates(gates) {
  for (const gate of gates) resultStatus(gate.run(), gate.label);
  return true;
}

function parseDeployments(output) {
  const records = JSON.parse(String(output || '[]'));
  const production = records.find(item => String(item.Environment).toLowerCase() === 'production');
  if (!production?.Id || !production?.Deployment || !production?.Source) throw new Error('deployment_metadata_missing');
  return { id: production.Id, url: production.Deployment, source: production.Source || '', branch: production.Branch || '' };
}

function atomicWrite(file, content, fsImpl = fs) {
  const temporary = `${file}.${process.pid}.tmp`;
  fsImpl.writeFileSync(temporary, content);
  fsImpl.renameSync(temporary, file);
}

module.exports = {
  REQUIRED_HEADERS, ALLOWED_CHANGE, canonicalUrl, parseSnapshot, serializeSnapshot, assertGitState,
  validateManifest, planChanges, changedFilesFromPorcelain, assertAllowedChanges, assertRequiredHeaders, assertLiveHeaders,
  resultStatus, runSequentialGates, parseDeployments, atomicWrite
};
