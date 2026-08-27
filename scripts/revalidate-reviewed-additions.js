#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { APPROVED_SOURCES } = require('../operations/opportunity-pipeline/config/sources');
const { fetchApprovedSources } = require('../operations/opportunity-pipeline/scripts/fetch-approved-sources');
const { evaluateOpportunity, stableOpportunityId, canonicalUrl, duplicateKeys } = require('../operations/opportunity-pipeline/lib/opportunity-safety');
const {
  HASH_DOMAIN, sha256, reviewedSourceEvidence, assertHashDomainMatch
} = require('../operations/opportunity-pipeline/lib/reviewed-source-evidence');
const {
  parseSnapshot, validateManifest, planChanges, atomicWrite
} = require('./lib/reviewed-opportunity-publisher');

const root = path.resolve(__dirname, '..');
const EXPECTED_ADDITIONS = 4;
const SOURCE_GUARDS = {
  'Action West London': {
    anchor: /Action West London is offering/i,
    required: [/Action West London is offering the opportunity for Market traders/i, /apply to be a trader at Saturday Market W3/i, /Acton, W3 9NW/i]
  },
  'Hawk Conservancy Trust': {
    anchor: /Christmas Market Stallholder Application Form Event:/i,
    required: [/Christmas Market Stallholder Application Form/i, /Dates:\s*26 November, 27 November, 28 November 29 November/i, /wish to apply/i]
  },
  'Love Wimbledon': {
    anchor: /Love Wimbledon’s popular Christmas Market/i,
    required: [/Dates for 2026/i, /November 27-29/i, /December 18-20/i, /Christmas Market Stall Application/i]
  },
  'Real Food Festival': {
    anchor: /Food Trader\? Apply For a Stall/i,
    required: [/Food Trader\? Apply For a Stall/i, /markets and events/i]
  }
};

function parseArgs(args) {
  return Object.fromEntries(args.map(arg => {
    const match = arg.match(/^--([a-z-]+)=(.+)$/);
    if (!match) throw new Error(`invalid_argument:${arg}`);
    return [match[1], match[2]];
  }));
}

function requireAbsolute(value, label) {
  if (!value || !path.isAbsolute(value)) throw new Error(`${label}_absolute_path_required`);
  return value;
}

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function manifestHash(manifest) {
  const copy = { ...manifest };
  delete copy.manifest_hash;
  return sha256(stableJson(copy));
}

function productionMatches(snapshot, row) {
  const keys = duplicateKeys(row);
  return snapshot.rows.flatMap(existing => {
    const shared = [...duplicateKeys(existing)].filter(key => keys.has(key));
    return shared.length ? [{
      id: existing.id || existing.stable_id || '', event_name: existing.event_name,
      organiser: existing.organiser, source_url: existing.source_url, matched_keys: shared.sort()
    }] : [];
  });
}

function closedSignal(text) {
  return /\b(?:applications? (?:are )?(?:now )?closed|bookings? (?:are )?closed|no longer accepting applications?|deadline has passed|fully booked)\b/i.test(text);
}

function sameValue(label, previous, current, url) {
  if (String(previous || '') !== String(current || '')) throw new Error(`material_evidence_changed:${label}:${url}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const previousReportPath = requireAbsolute(options['previous-report'], 'previous_report');
  const previousProposalPath = requireAbsolute(options['previous-proposal'], 'previous_proposal');
  const reportPath = requireAbsolute(options.report, 'report');
  const proposalPath = requireAbsolute(options.proposal, 'proposal');
  const today = options.today || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error('today_invalid');

  if (git('branch', '--show-current') !== 'main') throw new Error('guard_refused_non_main_branch');
  if (git('status', '--porcelain')) throw new Error('guard_refused_dirty_worktree');
  const reviewedCommit = git('rev-parse', 'HEAD');
  if (reviewedCommit !== git('rev-parse', 'origin/main')) throw new Error('guard_refused_stale_main');

  const snapshotSource = fs.readFileSync(path.join(root, 'functions/_data/opportunities.mjs'), 'utf8');
  const snapshot = parseSnapshot(snapshotSource);
  const previousReport = JSON.parse(fs.readFileSync(previousReportPath, 'utf8'));
  const previousProposal = JSON.parse(fs.readFileSync(previousProposalPath, 'utf8'));
  const previousSources = previousReport.sources.filter(item => item.classification === 'proposed_addition');
  const previousAdditions = previousProposal.changes.additions;
  if (snapshot.total !== snapshot.rows.length || snapshot.rows.length + EXPECTED_ADDITIONS !== 285) throw new Error(`count_mismatch:${snapshot.rows.length}:281`);
  if (previousSources.length !== EXPECTED_ADDITIONS || previousAdditions.length !== EXPECTED_ADDITIONS || previousProposal.changes.updates.length || previousProposal.changes.removals.length) throw new Error('count_mismatch:reviewed_change_set');

  const allowedUrls = new Set(previousSources.map(item => canonicalUrl(item.official_application_route)));
  const sources = APPROVED_SOURCES.filter(item => allowedUrls.has(canonicalUrl(item.official_application_route)));
  if (sources.length !== EXPECTED_ADDITIONS || new Set(sources.map(item => canonicalUrl(item.official_application_route))).size !== EXPECTED_ADDITIONS) throw new Error('count_mismatch:approved_source_scope');

  const generatedAt = new Date().toISOString();
  const result = await fetchApprovedSources({ sources, force: true, followLimit: 0, today });
  if (result.routes.length !== EXPECTED_ADDITIONS || result.outcomes.length !== EXPECTED_ADDITIONS || result.outcomes.some(item => item.followed)) throw new Error('count_mismatch:direct_fetch_scope');
  if (result.validationErrors.length) throw new Error(`material_evidence_changed:validation:${result.validationErrors.length}`);

  const reportSources = [];
  const additions = [];
  for (const previousSource of previousSources) {
    const url = canonicalUrl(previousSource.official_application_route);
    const guard = SOURCE_GUARDS[previousSource.organisation];
    const outcome = result.outcomes.find(item => canonicalUrl(item.url) === url);
    const extracted = result.rows.find(item => canonicalUrl(item.source_url) === url);
    const previousAddition = previousAdditions.find(item => canonicalUrl(item.row.source_url) === url);
    if (!guard || !outcome?.html || !extracted || !previousAddition) throw new Error(`material_evidence_changed:route_result_missing:${url}`);

    const evidence = reviewedSourceEvidence(outcome.html, { anchor: guard.anchor });
    assertHashDomainMatch({ sha256: previousSource.evidence.sha256, hash_domain: HASH_DOMAIN.NORMALISED_MATERIAL }, evidence.material);
    if (!guard.required.every(pattern => pattern.test(evidence.material.text))) throw new Error(`material_evidence_changed:required_wording:${url}`);
    if (closedSignal(evidence.stable_normalised_page.text || evidence.material.text)) throw new Error(`closed_route:${url}`);

    const evaluated = evaluateOpportunity(extracted, { now: new Date(`${today}T00:00:00Z`) });
    const previousExtracted = previousSource.extracted_opportunity;
    sameValue('event_start', previousExtracted.event_start, evaluated.event_start, url);
    sameValue('event_end', previousExtracted.event_end, evaluated.event_end, url);
    sameValue('application_url', previousAddition.row.application_url, canonicalUrl(outcome.finalUrl || outcome.url), url);
    sameValue('location', previousExtracted.location, evaluated.location, url);
    if (stableOpportunityId(evaluated) !== previousSource.proposed_record.id || previousSource.proposed_record.id !== previousAddition.row.id) throw new Error(`material_evidence_changed:stable_identity:${url}`);
    if (evaluated.quality_status !== 'customer_ready' || evaluated.publishable !== true || evaluated.quality_reasons.length) throw new Error(`material_evidence_changed:quality:${url}`);

    const duplicates = productionMatches(snapshot, previousAddition.row);
    if (duplicates.length) throw new Error(`duplicate:${url}:${duplicates.map(item => item.id).join(',')}`);
    const row = {
      ...previousAddition.row,
      last_checked: today,
      freshness_status: 'fresh',
      freshness_age_days: 0,
      notes: `Official first-party source directly rechecked on ${today}; trader route is actionable and no production duplicate was found.`
    };
    const evidenceRecord = {
      fetched_at: generatedAt,
      source_url: url,
      evidence_sha256: evidence.material.sha256,
      evidence_hash_domain: evidence.material.hash_domain,
      page_sha256: evidence.stable_normalised_page.sha256,
      page_hash_domain: evidence.stable_normalised_page.hash_domain,
      raw_page_sha256: evidence.raw_page.sha256,
      material_evidence_matches_review: true,
      closed_signal: false,
      production_duplicate_matches: []
    };
    reportSources.push({
      ...previousSource,
      fetch_result: { status: 'fetched', final_url: canonicalUrl(outcome.finalUrl || outcome.url), attempts: outcome.attempts || 1, failure: '' },
      extracted_opportunity: { ...previousExtracted, event_name: evaluated.event_name, organiser: evaluated.organiser, location: evaluated.location, region: evaluated.region, event_start: evaluated.event_start, event_end: evaluated.event_end, quality_status: evaluated.quality_status, quality_reasons: evaluated.quality_reasons, stable_id: stableOpportunityId(evaluated) },
      evidence: { excerpt: evidence.material.text.slice(0, 3000), sha256: evidence.material.sha256, hash_domain: evidence.material.hash_domain, page_sha256: evidence.stable_normalised_page.sha256, page_hash_domain: evidence.stable_normalised_page.hash_domain, raw_page_sha256: evidence.raw_page.sha256, material_evidence_matches_review: true, closed_signal: false },
      duplicate_matches: [], classification: 'proposed_addition', hold_reason: '', proposed_record: row
    });
    additions.push({ ...previousAddition, evidence: evidenceRecord, row });
  }

  const report = {
    report_version: 5,
    kind: 'pitchlist-controlled-reviewed-source-revalidation',
    generated_at: generatedAt,
    reviewed_commit: reviewedCommit,
    source_count: EXPECTED_ADDITIONS,
    serper_credits_used: 0,
    follow_links: false,
    production_write_enabled: false,
    automatic_removals_enabled: false,
    production_snapshot: { total: snapshot.total, exported_at: snapshot.exported_at, sha256: sha256(snapshotSource) },
    classification_counts: { proposed_addition: EXPECTED_ADDITIONS },
    sources: reportSources
  };
  atomicWrite(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  const proposal = {
    manifest_version: 1,
    kind: 'pitchlist-reviewed-addition-proposal',
    review_id: `reviewed-source-additions-${today}-main`,
    created_at: generatedAt,
    approval: { reviewed: true, approved_for_publish: true, reviewed_by: 'Chris Tucker', reviewed_commit: reviewedCommit, note: 'Regenerated against merged main after four-route like-for-like material-evidence revalidation; execution explicitly authorised.' },
    baseline: { production_count: snapshot.total, production_snapshot_exported_at: snapshot.exported_at, production_snapshot_sha256: sha256(snapshotSource) },
    evidence: { controlled_poll_report: reportPath, controlled_poll_report_sha256: sha256(fs.readFileSync(reportPath)), serper_credits_used: 0, link_following: false, production_writes: false },
    safety: { addition_only: true, updates_allowed: false, removals_allowed: false, expected_before_count: snapshot.total, expected_after_count: snapshot.total + EXPECTED_ADDITIONS },
    changes: { additions, updates: [], removals: [] }
  };
  proposal.manifest_hash = manifestHash(proposal);
  validateManifest(proposal, reviewedCommit);
  const planned = planChanges(snapshot, proposal);
  if (planned.summary.before_count !== 281 || planned.summary.after_count !== 285 || planned.summary.additions.length !== EXPECTED_ADDITIONS || planned.summary.updates.length || planned.summary.removals.length) throw new Error('count_mismatch:publication_plan');
  atomicWrite(proposalPath, `${JSON.stringify(proposal, null, 2)}\n`);
  console.log(JSON.stringify({ report: reportPath, report_sha256: sha256(fs.readFileSync(reportPath)), proposal: proposalPath, proposal_sha256: sha256(fs.readFileSync(proposalPath)), manifest_hash: proposal.manifest_hash, reviewed_commit: reviewedCommit, additions: additions.map(item => item.row.id), before_count: 281, after_count: 285 }, null, 2));
}

main().catch(error => { console.error(String(error.message || error).replace(/[^a-z0-9_.,:/ -]+/gi, '')); process.exit(1); });
