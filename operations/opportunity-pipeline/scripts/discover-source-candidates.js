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
const { classifySourceCandidate, upsertCandidateRegistry } = require('../lib/source-onboarding');
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
  const unique = [...new Map(results.map(item => [canonicalUrl(item.url), item])).values()].filter(item => item.url).slice(0, options.maxCandidates || 50);
  const outcomes = await (options.fetchBatch || fetchCandidateBatch)(unique, { concurrency: options.concurrency || 2 });
  const candidates = outcomes.map(outcome => classifySourceCandidate(candidateInput(outcome, now), { now }));
  return { plans, candidates, outcomes, preflight };
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
  const result = await discover({
    queryLimit: Number(process.env.PITCHLIST_SOURCE_DISCOVERY_QUERY_LIMIT || 12),
    queryOffset: Number(process.env.PITCHLIST_SOURCE_DISCOVERY_QUERY_OFFSET || 0),
    searchNum: Number(process.env.PITCHLIST_SOURCE_DISCOVERY_SEARCH_NUM || 6),
    maxCandidates: Number(process.env.PITCHLIST_SOURCE_DISCOVERY_MAX_CANDIDATES || 50),
    concurrency: Number(process.env.PITCHLIST_SOURCE_DISCOVERY_CONCURRENCY || 2)
  });
  const merged = upsertCandidateRegistry(existing, result.candidates);
  const generatedAt = new Date().toISOString();
  atomicWriteJson(registryPath, { version: 1, generated_at: generatedAt, records: merged.records });
  const reportPath = path.join(root, 'data', 'source-candidates', `discovery-${generatedAt.replace(/[:.]/g, '-')}.json`);
  atomicWriteJson(reportPath, {
    generated_at: generatedAt, queries: result.plans, credits_used: result.plans.length,
    candidates_discovered: result.candidates.length, registry_added: merged.added, registry_updated: merged.updated, registry_skipped: merged.skipped,
    classifications: result.candidates.reduce((counts, item) => ({ ...counts, [item.classification]: (counts[item.classification] || 0) + 1 }), {}),
    candidates: result.candidates, production_write_enabled: false
  });
  console.log(JSON.stringify({ registryPath, reportPath, candidates: result.candidates.length, added: merged.added, updated: merged.updated, skipped: merged.skipped, productionWriteEnabled: false }, null, 2));
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exit(1); });
module.exports = { inferOpportunityType, inferOrganisation, candidateInput, discover };
