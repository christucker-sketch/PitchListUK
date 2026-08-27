#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { serperSearch } = require('../acquisition/search');
const { cleanHtml } = require('../acquisition/fetch-page');
const { discoveryQueries } = require('../acquisition/source-discovery');
const { canonicalUrl } = require('../lib/opportunity-safety');
const { preflightFromEnv } = require('../lib/credit-budget');
const { fetchCandidateBatch } = require('../lib/source-candidate-fetch');
const { classifySourceCandidate, upsertCandidateRegistry, PLATFORM_HOST } = require('../lib/source-onboarding');
const { planAcceleratedDiscovery, BLOCKED_FAILURE } = require('../lib/source-growth-planner');
const { runtimeRoot, atomicWriteJson } = require('../lib/staging-store');

function inferOpportunityType(text) {
  if (/christmas/i.test(text)) return 'christmas_market';
  if (/racecourse|venue/i.test(text)) return 'venue_trader_application';
  if (/county show|agricultural show/i.test(text)) return 'show_trader_application';
  if (/artisan/i.test(text)) return 'artisan_market';
  if (/festival/i.test(text)) return 'festival_trader_application';
  return 'recurring_market';
}

function inferOrganisation(title, host) {
  return String(title || '').replace(/\s*[|–—-]\s*(?:apply|applications?|traders?|stallholders?|vendors?|official).*$/i, '').trim() || host;
}

function candidateInput(outcome, now) {
  const result = outcome.candidate || {};
  const pageText = cleanHtml(outcome.page_text || '');
  const route = canonicalUrl(outcome.final_url || result.url);
  const host = (() => { try { return new URL(route).hostname.replace(/^www\./, ''); } catch { return ''; } })();
  return {
    url: route, title: result.title, snippet: result.snippet, page_text: pageText,
    organisation: inferOrganisation(result.title, host), organiser_type: /\.gov\.uk$/i.test(host) ? 'local-authority' : 'event-organiser',
    geographic_coverage: result.region || '', opportunity_type: inferOpportunityType(`${result.query} ${result.title} ${result.snippet}`),
    discovery_query: result.query, discovered_at: now,
    first_party_evidence: /\.gov\.uk$/i.test(host) ? `Official public-service host ${host}` : `Search result and retrieved page use canonical host ${host}`,
    trader_application_evidence: pageText.slice(0, 6000), robots_result: outcome.fetch_status === 'fetched' ? 'allowed' : outcome.fetch_status,
    terms_review_status: /\.gov\.uk$/i.test(host) ? 'public-service' : 'manual-review-required', fetch_status: outcome.fetch_status,
    recommended_polling_days: /market/i.test(pageText) ? 14 : 30
  };
}

async function discover(options = {}) {
  const now = options.now || new Date().toISOString();
  const plans = options.plans || discoveryQueries({ limit: options.queryLimit || 12, offset: options.queryOffset || 0 });
  const preflight = options.preflight || preflightFromEnv(plans.length);
  if (!preflight.allowed) throw new Error(`source_discovery_preflight_blocked:${preflight.reason}`);
  const results = [];
  for (const plan of plans) {
    const found = await (options.search || serperSearch)(plan.query, { num: options.searchNum || 6 });
    results.push(...found.map(item => ({ ...item, region: plan.region })));
  }
  const excludedHosts = new Set(options.excludedHosts || []);
  const skipped = [];
  const unique = [...new Map(results.map(item => [canonicalUrl(item.url), item])).values()].filter(item => {
    if (!item.url) return false;
    let host = '';
    try { host = new URL(item.url).hostname.replace(/^www\./, ''); } catch { skipped.push({ url: item.url, reason: 'invalid_url' }); return false; }
    if (PLATFORM_HOST.test(host)) { skipped.push({ url: item.url, reason: 'platform_route_rejected' }); return false; }
    if (excludedHosts.has(host)) { skipped.push({ url: item.url, reason: 'known_blocked_host' }); return false; }
    return true;
  }).slice(0, options.maxCandidates || 50);
  const outcomes = await (options.fetchBatch || fetchCandidateBatch)(unique, { concurrency: options.concurrency || 2 });
  const candidates = outcomes.map(outcome => classifySourceCandidate(candidateInput(outcome, now), { now }));
  return { plans, candidates, outcomes, preflight, skipped };
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function discoveryReports(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).filter(name => /^discovery-.*\.json$/.test(name)).map(name => readJson(path.join(directory, name), {}));
}

function blockedHosts(records) {
  return [...new Set((records || []).filter(item => item.classification === 'fetch-failed' && BLOCKED_FAILURE.test(item.rejection_reason || item.fetch_status)).map(item => item.canonical_host).filter(Boolean))];
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.includes('--apply')) {
    const plans = discoveryQueries({ limit: Number(process.env.PITCHLIST_SOURCE_DISCOVERY_QUERY_LIMIT || 12), offset: Number(process.env.PITCHLIST_SOURCE_DISCOVERY_QUERY_OFFSET || 0) });
    console.log(JSON.stringify({ mode: 'dry-run', planned_queries: plans, candidate_cap: Number(process.env.PITCHLIST_SOURCE_DISCOVERY_MAX_CANDIDATES || 50), production_write_enabled: false }, null, 2));
    return;
  }
  const root = runtimeRoot();
  const registryPath = path.join(root, 'data', 'source-candidates', 'registry.json');
  const existing = fs.existsSync(registryPath) ? JSON.parse(fs.readFileSync(registryPath, 'utf8')).records || [] : [];
  const accelerated = String(process.env.PITCHLIST_ACCELERATED_GROWTH || '').toLowerCase() === 'true';
  const statePath = path.join(root, 'data', 'source-candidates', 'accelerated-growth-state.json');
  const state = readJson(statePath, { version: 1, completed_batches: [] });
  const reports = discoveryReports(path.dirname(registryPath));
  const planned = accelerated ? planAcceleratedDiscovery({ records: existing, reports, completed: state.completed_batches, limit: Number(process.env.PITCHLIST_SOURCE_DISCOVERY_QUERY_LIMIT || 8) }) : null;
  const result = await discover({
    plans: planned?.plans,
    queryLimit: Number(process.env.PITCHLIST_SOURCE_DISCOVERY_QUERY_LIMIT || 12),
    queryOffset: Number(process.env.PITCHLIST_SOURCE_DISCOVERY_QUERY_OFFSET || 0),
    searchNum: Number(process.env.PITCHLIST_SOURCE_DISCOVERY_SEARCH_NUM || 6),
    maxCandidates: Number(process.env.PITCHLIST_SOURCE_DISCOVERY_MAX_CANDIDATES || 50),
    concurrency: Number(process.env.PITCHLIST_SOURCE_DISCOVERY_CONCURRENCY || 2),
    excludedHosts: blockedHosts(existing)
  });
  const generatedAt = new Date().toISOString();
  const reviewedExisting = existing.map(item => item.classification === 'auto-approvable-first-party' && item.approval_status === 'pending' ? {
    ...item, approval_status: 'approved', reviewer_decision: 'approved_unambiguous_public_service_first_party',
    reviewer: 'PitchList accelerated deterministic source automation', decision_timestamp: generatedAt
  } : item);
  const candidates = result.candidates.map(item => item.classification === 'auto-approvable-first-party' && item.approval_status === 'pending' ? {
    ...item, approval_status: 'approved', reviewer_decision: 'approved_unambiguous_public_service_first_party',
    reviewer: 'PitchList accelerated deterministic source automation', decision_timestamp: generatedAt
  } : item);
  const merged = upsertCandidateRegistry(reviewedExisting, candidates, { now: generatedAt });
  atomicWriteJson(registryPath, { version: 1, generated_at: generatedAt, records: merged.records });
  const reportPath = path.join(root, 'data', 'source-candidates', `discovery-${generatedAt.replace(/[:.]/g, '-')}.json`);
  atomicWriteJson(reportPath, {
    generated_at: generatedAt, queries: result.plans, credits_used: result.plans.length,
    candidates_discovered: candidates.length, registry_added: merged.added, registry_updated: merged.updated, registry_skipped: merged.skipped,
    results_skipped: result.skipped, auto_approved: candidates.filter(item => item.approval_status === 'approved').length,
    review_queue_count: candidates.filter(item => item.classification === 'manual-review-required' && item.approval_status === 'pending').length,
    classifications: candidates.reduce((counts, item) => ({ ...counts, [item.classification]: (counts[item.classification] || 0) + 1 }), {}),
    candidates, production_write_enabled: false
  });
  if (accelerated) atomicWriteJson(statePath, { version: 1, updated_at: generatedAt, completed_batches: [...new Set([...(state.completed_batches || []), ...result.plans.map(item => item.batch_id).filter(Boolean)])], suppressed_templates: planned.suppressed_templates });
  const reviewQueuePath = path.join(root, 'data', 'source-candidates', 'review-queue.json');
  const reviewQueue = merged.records.filter(item => item.classification === 'manual-review-required' && item.approval_status === 'pending');
  atomicWriteJson(reviewQueuePath, { version: 1, generated_at: generatedAt, records: reviewQueue });
  console.log(JSON.stringify({ registryPath, reportPath, statePath: accelerated ? statePath : null, sources_checked: result.outcomes.length, candidates_discovered: candidates.length, auto_approved: candidates.filter(item => item.approval_status === 'approved').length, held_exceptions: reviewQueue.length, credits_used: result.plans.length, added: merged.added, updated: merged.updated, skipped: merged.skipped, productionWriteEnabled: false }, null, 2));
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exit(1); });
module.exports = { inferOpportunityType, inferOrganisation, candidateInput, discover, blockedHosts, discoveryReports };
