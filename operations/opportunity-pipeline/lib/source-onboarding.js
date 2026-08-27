'use strict';

const crypto = require('node:crypto');
const { canonicalUrl } = require('./opportunity-safety');
const { hostname, sourceRuleFor } = require('../config/sources');

const STATUS = Object.freeze({
  AUTO: 'auto-approvable-first-party',
  REVIEW: 'manual-review-required',
  AGGREGATOR: 'rejected-aggregator',
  LICENCE: 'rejected-licence-only',
  NO_ROUTE: 'rejected-no-live-trader-route',
  FOREIGN: 'rejected-foreign',
  DUPLICATE: 'rejected-duplicate',
  POLICY: 'rejected-policy',
  FETCH_FAILED: 'fetch-failed'
});

const AGGREGATOR = /\b(?:eventbrite|facebook|instagram|what'?s on|events? directory|find an? event|listing site|aggregator)\b/i;
const TRADER_ROUTE = /\b(?:apply|application|register|registration|book(?:ing)?|enquire|expression of interest|become|join)\b[\s\S]{0,100}\b(?:trader|stallholder|vendor|exhibitor|caterer|trade stand|market stall|pitch)\b|\b(?:trader|stallholder|vendor|exhibitor|caterer|trade stand|market stall|pitch)\b[\s\S]{0,100}\b(?:apply|application|register|registration|book(?:ing)?|enquire|expression of interest|become|join|available|wanted)\b/i;
const OPPORTUNITY_CONTEXT = /\b(?:market|festival|fair|show|event|racecourse|venue|food|artisan|christmas|street food|county show|agricultural show)\b/i;
const LICENCE = /\b(?:street trading|street trader|mobile trading)\s+(?:licen[cs]e|consent|permit)\b/i;
const AVAILABLE_PITCH = /\b(?:available|vacant|wanted|applications? open|apply to trade|apply for (?:a )?(?:market )?(?:stall|pitch)|trade (?:at|with)|become a trader)\b/i;
const UK_EVIDENCE = /\b(?:United Kingdom|England|Scotland|Wales|Northern Ireland|Great Britain|UK)\b|\b(?:GIR\s?0AA|(?:[A-PR-UWYZ][A-HK-Y]?\d[A-Z\d]?\s?\d[ABD-HJLNP-UW-Z]{2}))\b/i;
const FOREIGN_EVIDENCE = /\b(?:United States|USA|Canada|Australia|New Zealand|Republic of Ireland|Dublin|\$\d|USD|CAD|AUD)\b/i;
const PUBLIC_SERVICE_HOST = /(?:^|\.)gov\.uk$/i;
const PLATFORM_HOST = /(?:^|\.)(?:facebook\.com|instagram\.com|youtube\.com|youtu\.be|eventbrite\.(?:com|co\.uk)|linkedin\.com|tiktok\.com|x\.com|twitter\.com)$/i;
const NON_SOURCE_HOST = /(?:^|\.)(?:pitchlist\.uk|festfinder\.co\.uk|pitchmarketsandeventsuk\.com)$/i;

function normalisePathPrefix(value) {
  try {
    const path = new URL(value).pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
    return path;
  } catch { return ''; }
}

function candidateKey(value) {
  const url = canonicalUrl(value);
  return url ? crypto.createHash('sha256').update(url).digest('hex').slice(0, 24) : '';
}

function evidenceHash(candidate) {
  const evidence = {
    canonical_route: canonicalUrl(candidate.canonical_route || candidate.url),
    organisation: String(candidate.organisation || ''),
    first_party_evidence: String(candidate.first_party_evidence || ''),
    trader_application_evidence: String(candidate.trader_application_evidence || candidate.page_text || ''),
    robots_result: String(candidate.robots_result || ''),
    terms_review_status: String(candidate.terms_review_status || '')
  };
  return crypto.createHash('sha256').update(JSON.stringify(evidence)).digest('hex');
}

function classifySourceCandidate(raw, options = {}) {
  const route = canonicalUrl(raw.canonical_route || raw.final_url || raw.url);
  const host = hostname(route);
  const text = [raw.title, raw.snippet, raw.page_text, raw.first_party_evidence, raw.trader_application_evidence].join(' ');
  const approvedRule = sourceRuleFor(route);
  const base = {
    candidate_id: candidateKey(route), canonical_host: host, canonical_route: route,
    source_path_prefix: normalisePathPrefix(route), organisation: String(raw.organisation || '').trim(),
    organiser_type: raw.organiser_type || (PUBLIC_SERVICE_HOST.test(host) ? 'local-authority' : 'event-organiser'),
    geographic_coverage: String(raw.geographic_coverage || '').trim(), opportunity_type: String(raw.opportunity_type || '').trim(),
    discovery_query: String(raw.discovery_query || raw.query || ''), discovered_at: raw.discovered_at || options.now || new Date().toISOString(),
    first_party_evidence: String(raw.first_party_evidence || '').slice(0, 4000),
    trader_application_evidence: String(raw.trader_application_evidence || raw.page_text || '').slice(0, 6000),
    robots_result: String(raw.robots_result || ''), terms_review_status: String(raw.terms_review_status || ''),
    fetch_status: String(raw.fetch_status || ''), rejection_reason: '', duplicate_source_result: '',
    approval_status: 'pending', reviewer_decision: '', recommended_polling_days: Number(raw.recommended_polling_days || 30),
    observed_candidate_yield: Number(raw.observed_candidate_yield || 0)
  };
  const finish = (classification, reason = '') => ({ ...base, classification, rejection_reason: reason, evidence_hash: evidenceHash({ ...raw, canonical_route: route }) });

  if (!route || !/^https:/.test(route)) return finish(STATUS.POLICY, 'https_route_required');
  if (PLATFORM_HOST.test(host)) return finish(STATUS.AGGREGATOR, 'platform_route_rejected');
  if (NON_SOURCE_HOST.test(host)) return finish(STATUS.AGGREGATOR, 'known_non_first_party_route_rejected');
  if (raw.fetch_status && raw.fetch_status !== 'fetched') return finish(STATUS.FETCH_FAILED, raw.fetch_status);
  if (raw.robots_result && raw.robots_result !== 'allowed') return finish(STATUS.POLICY, `robots_${raw.robots_result}`);
  if (approvedRule.approved) return { ...finish(STATUS.DUPLICATE, 'approved_route_already_registered'), duplicate_source_result: approvedRule.official_application_route || approvedRule.host };
  if (AGGREGATOR.test(`${host} ${text}`) || raw.is_aggregator === true) return finish(STATUS.AGGREGATOR, 'aggregator_evidence');
  if (FOREIGN_EVIDENCE.test(text) || (host && !/(?:\.uk|\.gov\.uk)$/i.test(host) && raw.uk_evidence !== true && !UK_EVIDENCE.test(text))) return finish(STATUS.FOREIGN, 'uk_evidence_missing_or_foreign');
  if (LICENCE.test(text) && !AVAILABLE_PITCH.test(text)) return finish(STATUS.LICENCE, 'licence_without_specific_available_pitch');
  if (!TRADER_ROUTE.test(text) || !OPPORTUNITY_CONTEXT.test(text)) return finish(STATUS.NO_ROUTE, 'live_trader_application_evidence_missing');
  if (!base.organisation || !base.geographic_coverage || !base.opportunity_type) return finish(STATUS.REVIEW, 'source_metadata_incomplete');
  if (PUBLIC_SERVICE_HOST.test(host) && base.first_party_evidence && raw.terms_review_status === 'public-service') return finish(STATUS.AUTO);
  return finish(STATUS.REVIEW, 'private_or_non_public_service_source_requires_review');
}

function nextRecheckAt(candidate, now = new Date()) {
  const rejected = String(candidate.classification || '').startsWith('rejected-');
  const days = rejected ? 90 : candidate.classification === STATUS.FETCH_FAILED ? 7 : 30;
  return new Date(now.getTime() + days * 86400000).toISOString();
}

function upsertCandidateRegistry(existing, incoming, options = {}) {
  const now = new Date(options.now || new Date().toISOString());
  const records = new Map((existing || []).map(item => [item.candidate_id || candidateKey(item.canonical_route), item]));
  let added = 0; let updated = 0; let skipped = 0;
  for (const raw of incoming || []) {
    const candidate = raw.classification ? raw : classifySourceCandidate(raw, { now: now.toISOString() });
    if (!candidate.candidate_id) { skipped++; continue; }
    const previous = records.get(candidate.candidate_id);
    if (previous?.next_recheck_at && Date.parse(previous.next_recheck_at) > now.getTime() && previous.evidence_hash === candidate.evidence_hash) { skipped++; continue; }
    const protectedDecision = previous?.approval_status === 'approved' || previous?.approval_status === 'rejected';
    records.set(candidate.candidate_id, {
      ...previous, ...candidate,
      approval_status: protectedDecision ? previous.approval_status : candidate.approval_status,
      reviewer_decision: protectedDecision ? previous.reviewer_decision : candidate.reviewer_decision,
      reviewer: protectedDecision ? previous.reviewer : (candidate.reviewer || ''), decision_timestamp: protectedDecision ? previous.decision_timestamp : (candidate.decision_timestamp || ''),
      last_evaluated_at: now.toISOString(), next_recheck_at: nextRecheckAt(candidate, now)
    });
    if (previous) updated++; else added++;
  }
  return { records: [...records.values()].sort((a, b) => a.canonical_route.localeCompare(b.canonical_route)), added, updated, skipped };
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function manifestHash(manifest) {
  const copy = { ...manifest };
  delete copy.manifest_hash;
  return crypto.createHash('sha256').update(stableJson(copy)).digest('hex');
}

function buildSourcePromotionManifest({ candidates, reviewedCommit, reviewer, expectedSourceCount, now = new Date().toISOString() }) {
  if (!/^[a-f0-9]{40}$/i.test(String(reviewedCommit || ''))) throw new Error('source_manifest_reviewed_commit_required');
  if (!String(reviewer || '').trim()) throw new Error('source_manifest_reviewer_required');
  const approved = (candidates || []).filter(item => item.approval_status === 'approved');
  if (!approved.length) throw new Error('source_manifest_no_approved_candidates');
  const routes = approved.map(item => {
    if (![STATUS.AUTO, STATUS.REVIEW].includes(item.classification)) throw new Error(`source_manifest_invalid_classification:${item.candidate_id}`);
    if (!item.evidence_hash || !item.canonical_host || !item.canonical_route || !item.source_path_prefix || !item.organisation || !item.geographic_coverage || !item.opportunity_type) throw new Error(`source_manifest_evidence_missing:${item.candidate_id}`);
    if (item.classification === STATUS.REVIEW && !item.reviewer_decision) throw new Error(`source_manifest_manual_decision_missing:${item.candidate_id}`);
    return {
      candidate_id: item.candidate_id, host: item.canonical_host, organisation: item.organisation,
      type: item.organiser_type, terms_policy: item.classification === STATUS.AUTO ? 'public-service' : 'manual-reviewed',
      geographic_coverage: item.geographic_coverage, opportunity_type: item.opportunity_type,
      official_application_route: item.canonical_route, recurring: item.recurring === true,
      recommended_polling_days: Number(item.recommended_polling_days || 30), opportunity_title: item.opportunity_title || item.organisation,
      source_path_prefix: item.source_path_prefix, evidence_hash: item.evidence_hash, decision: item.reviewer_decision || 'approved-public-service'
    };
  });
  if (new Set(routes.map(item => item.official_application_route)).size !== routes.length) throw new Error('source_manifest_duplicate_routes');
  const manifest = {
    manifest_version: 1, kind: 'pitchlist-source-promotion', created_at: now,
    reviewed_commit: reviewedCommit, reviewer, expected_source_count_before: Number(expectedSourceCount),
    expected_source_count_after: Number(expectedSourceCount) + routes.length, removals_allowed: false, routes
  };
  manifest.manifest_hash = manifestHash(manifest);
  return manifest;
}

function validateSourcePromotionManifest(manifest, options = {}) {
  if (manifest?.manifest_version !== 1 || manifest?.kind !== 'pitchlist-source-promotion') throw new Error('source_manifest_invalid');
  if (manifest.removals_allowed !== false) throw new Error('source_manifest_removals_forbidden');
  if (manifest.manifest_hash !== manifestHash(manifest)) throw new Error('source_manifest_hash_mismatch');
  if (options.reviewedCommit && manifest.reviewed_commit !== options.reviewedCommit) throw new Error('source_manifest_sha_mismatch');
  if (Number(manifest.expected_source_count_before) !== Number(options.currentSourceCount)) throw new Error('source_manifest_source_count_mismatch');
  if (manifest.expected_source_count_after !== manifest.expected_source_count_before + manifest.routes.length) throw new Error('source_manifest_after_count_invalid');
  return true;
}

module.exports = {
  STATUS, PLATFORM_HOST, NON_SOURCE_HOST, candidateKey, evidenceHash, classifySourceCandidate, nextRecheckAt, upsertCandidateRegistry,
  manifestHash, buildSourcePromotionManifest, validateSourcePromotionManifest, normalisePathPrefix
};
