#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { APPROVED_SOURCES, hostname, sourceRuleFor, termsReviewed } = require('../config/sources');
const { sourceCandidateToRow } = require('../acquisition/extract');
const { extractLinks } = require('../acquisition/fetch-page');
const { FIELDNAMES } = require('../acquisition/config');
const { toCsv, validateRows } = require('../acquisition/csv');
const { canonicalUrl } = require('../lib/opportunity-safety');
const { createPolicyFetcher, mapBounded } = require('../lib/fetch-policy');
const { runtimeRoot, atomicWriteJson } = require('../lib/staging-store');

const RELEVANT_LINK = /(trader|stallholder|vendor|exhibitor|cater|street.?food|concession|market|pitch|apply|application|register|book)/i;

function directSourceRoutes(sources = APPROVED_SOURCES, options = {}) {
  const byUrl = new Map();
  const now = Date.parse(options.now || new Date().toISOString());
  const state = options.state || {};
  for (const source of sources) {
    const url = canonicalUrl(source.official_application_route);
    if (!url || !source.approved || !termsReviewed(source)) continue;
    const last = Date.parse(state[url]?.checked_at || '');
    const dueAt = Number.isFinite(last) ? last + Number(source.recommended_polling_days || 30) * 86400000 : 0;
    if (!options.force && dueAt > now) continue;
    byUrl.set(url, source);
  }
  return [...byUrl.entries()].map(([url, source]) => ({ url, source }));
}

function approvedFollowLinks(html, baseUrl, limit = 2) {
  const baseHost = hostname(baseUrl);
  const seen = new Set([canonicalUrl(baseUrl)]);
  return extractLinks(html, baseUrl)
    .filter(link => hostname(link.url) === baseHost && RELEVANT_LINK.test(`${link.label} ${link.url}`))
    .filter(link => {
      const url = canonicalUrl(link.url);
      const rule = sourceRuleFor(url);
      if (!url || seen.has(url) || !rule.approved || !termsReviewed(rule)) return false;
      seen.add(url);
      return true;
    })
    .slice(0, limit)
    .map(link => ({ url: canonicalUrl(link.url), label: String(link.label || '').slice(0, 180) }));
}

function atomicWriteText(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, value, { mode: 0o600 });
  fs.renameSync(temporary, target);
}

async function fetchApprovedSources(options = {}) {
  const routes = directSourceRoutes(options.sources, { state: options.state, now: options.now, force: options.force });
  const fetchWithPolicy = options.fetchWithPolicy || createPolicyFetcher().fetchWithPolicy;
  const concurrency = Math.min(3, Math.max(1, Number(options.concurrency || process.env.PITCHLIST_DIRECT_FETCH_CONCURRENCY || 2)));
  const followLimit = Math.min(3, Math.max(0, Number(options.followLimit ?? process.env.PITCHLIST_DIRECT_FOLLOW_LIMIT ?? 2)));
  const today = options.today || new Date().toISOString().slice(0, 10);
  const primary = await mapBounded(routes, concurrency, async route => {
    const result = await fetchWithPolicy(route.url);
    if (!result.ok) return { url: route.url, source: route.source, failure: result.classification, attempts: result.attempts || 0 };
    const html = (await result.response.text()).slice(0, 240000);
    return { url: route.url, finalUrl: canonicalUrl(result.final_url || route.url), source: route.source, html, attempts: result.attempts || 1 };
  });
  const linked = primary.flatMap(item => item.html ? approvedFollowLinks(item.html, item.finalUrl || item.url, followLimit).map(link => ({ ...link, source: item.source })) : []);
  const linksByUrl = [...new Map(linked.map(item => [item.url, item])).values()].filter(item => !routes.some(route => route.url === item.url));
  const followed = await mapBounded(linksByUrl, concurrency, async link => {
    const result = await fetchWithPolicy(link.url);
    if (!result.ok) return { url: link.url, source: link.source, failure: result.classification, attempts: result.attempts || 0, followed: true };
    return { url: link.url, finalUrl: canonicalUrl(result.final_url || link.url), source: link.source, html: (await result.response.text()).slice(0, 240000), attempts: result.attempts || 1, followed: true };
  });
  const outcomes = [...primary, ...followed];
  const rows = outcomes.filter(item => item.html).map(item => sourceCandidateToRow({
    url: item.finalUrl || item.url,
    title: item.source.opportunity_title || item.source.organisation,
    snippet: 'Direct approved-source retrieval',
    query: `direct:${item.url}`,
    query_lane: 'approved-source-direct-fetch'
  }, item.html, today));
  const validationErrors = validateRows(rows);
  const invalid = new Set(validationErrors.map(error => error.index));
  return { routes, outcomes, rows: rows.filter((_, index) => !invalid.has(index)), validationErrors };
}

async function main() {
  const statePath = path.join(runtimeRoot(), 'data', 'approved-source-check-state.json');
  const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : {};
  const result = await fetchApprovedSources({ state, force: process.argv.includes('--force') });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const directory = path.join(runtimeRoot(), 'data', 'staging');
  const csvPath = path.join(directory, `events-direct-approved-${stamp}.csv`);
  const reportPath = path.join(directory, `events-direct-approved-${stamp}.report.json`);
  atomicWriteText(csvPath, toCsv(result.rows, FIELDNAMES));
  atomicWriteJson(reportPath, {
    generated_at: new Date().toISOString(), mode: 'direct-approved-source-fetch',
    approved_sources_checked: result.routes.length, serper_credits_used: 0,
    pages_attempted: result.outcomes.length, pages_fetched: result.outcomes.filter(item => item.html).length,
    rows: result.rows.length, validation_errors: result.validationErrors,
    failures: result.outcomes.filter(item => item.failure).map(item => ({ source_url: item.url, classification: item.failure, attempts: item.attempts })),
    fetched_urls: result.outcomes.filter(item => item.html).map(item => canonicalUrl(item.finalUrl || item.url)),
    source_results: result.routes.map(route => ({ source_owner: route.source.organisation, domain: route.source.host, geographic_coverage: route.source.geographic_coverage, opportunity_type: route.source.opportunity_type, official_application_route: route.url, recurring: route.source.recurring, recommended_polling_days: route.source.recommended_polling_days })),
    production_write_enabled: false
  });
  for (const outcome of result.outcomes.filter(item => !item.followed)) state[canonicalUrl(outcome.url)] = { checked_at: new Date().toISOString(), success: Boolean(outcome.html), failure: outcome.failure || null };
  atomicWriteJson(statePath, state);
  console.log(JSON.stringify({ csvPath, reportPath, approvedSourcesChecked: result.routes.length, pagesFetched: result.outcomes.filter(item => item.html).length, rows: result.rows.length, serperCreditsUsed: 0, productionWriteEnabled: false }, null, 2));
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exit(1); });
module.exports = { RELEVANT_LINK, directSourceRoutes, approvedFollowLinks, fetchApprovedSources };
