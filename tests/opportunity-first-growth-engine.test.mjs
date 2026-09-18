import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateCanadaSourceEvidence } from '../operations/cloudflare-global-acquisition/lib/ca-source-evidence.mjs';
import { buildUkOpportunityPlan, hasUkActionableOpportunityEvidence, runUkOpportunityFirstDiscovery } from '../operations/cloudflare-global-acquisition/lib/uk-opportunity-first-discovery.mjs';
import { promoteUkOpportunityFirstCandidates } from '../operations/cloudflare-global-acquisition/lib/uk-source-discovery-workflow.mjs';
import { growthQueryBatch, growthQueryPlan } from '../operations/cloudflare-texas-acquisition/src/us-growth-plan.js';

test('Canada approves a same-host first-party organiser with actionable opportunity evidence', () => {
  const result = evaluateCanadaSourceEvidence({
    region_code: 'ON',
    source_url: 'https://examplefestival.ca/vendors',
    application_url: 'https://examplefestival.ca/vendors/apply',
    title: 'Ontario Summer Festival Vendor Applications',
    page_text: 'Ontario summer festival vendor applications are open. Vendors can apply using the application form and submit fees.'
  });
  assert.equal(result.status, 'approved');
  assert.equal(result.source_class, 'event-organiser');
  assert.equal(result.reason, 'canada_deterministic_first_party_organiser_evidence');
});

test('Canada still rejects platform and aggregator routes', () => {
  const result = evaluateCanadaSourceEvidence({
    region_code: 'ON',
    source_url: 'https://eventbrite.ca/e/example',
    application_url: 'https://eventbrite.ca/e/example',
    title: 'Ontario Festival Vendor Application',
    page_text: 'Ontario festival vendors can apply using this application form.'
  });
  assert.equal(result.status, 'held');
  assert.equal(result.reason, 'canada_non_first_party_platform_rejected');
});

test('Canada cross-host application routes remain review-gated', () => {
  const result = evaluateCanadaSourceEvidence({
    region_code: 'BC',
    source_url: 'https://examplefestival.ca/vendors',
    application_url: 'https://forms.example.net/vendor-application',
    title: 'British Columbia Festival Vendor Application',
    page_text: 'British Columbia festival vendor applications are open. Vendors may submit the application form.'
  });
  assert.equal(result.status, 'review');
  assert.equal(result.reason, 'canada_cross_host_application_requires_review');
});

test('UK deterministic first-party review candidates are promoted without weakening rejected classes', () => {
  const candidate = {
    classification: 'manual-review-required',
    rejection_reason: 'private_or_non_public_service_source_requires_review',
    approval_status: 'pending',
    canonical_route: 'https://examplemarket.co.uk/traders',
    canonical_host: 'examplemarket.co.uk',
    organisation: 'Example Market',
    geographic_coverage: 'England',
    opportunity_type: 'recurring_market',
    trader_application_evidence: 'Applications open to traders',
    fetch_status: 'fetched',
    robots_result: 'allowed'
  };
  const result = promoteUkOpportunityFirstCandidates({ approved_candidates: [], review_queue: [candidate], auto_approved_count: 0 });
  assert.equal(result.approved_candidates.length, 1);
  assert.equal(result.review_queue.length, 0);
  assert.equal(result.approved_candidates[0].reviewer_decision, 'approved_deterministic_first_party_live_trader_route');
});

test('UK direct-graph private promotion refuses placeholder geography', () => {
  const candidate = {
    classification: 'manual-review-required',
    rejection_reason: 'private_or_non_public_service_source_requires_review',
    approval_status: 'pending',
    canonical_route: 'https://broadstairsfoodfestival.org.uk/trader-tcs',
    canonical_host: 'broadstairsfoodfestival.org.uk',
    organisation: 'Broadstairs Food Festival',
    geographic_coverage: 'UK trusted-source graph',
    opportunity_type: 'festival_trader_application',
    trader_application_evidence: 'Trader terms and application conditions',
    fetch_status: 'fetched',
    robots_result: 'allowed'
  };
  const result = promoteUkOpportunityFirstCandidates({ approved_candidates: [], review_queue: [candidate], auto_approved_count: 0 });
  assert.equal(result.approved_candidates.length, 0);
  assert.equal(result.review_queue.length, 1);
});

test('UK opportunity evidence rejects careers information but accepts actionable trader applications', () => {
  assert.equal(hasUkActionableOpportunityEvidence({
    route: 'https://nationalcareers.service.gov.uk/job-profiles/market-trader',
    title: 'Market trader | Explore Careers',
    snippet: 'Learn about salary, skills and how to become a market trader.',
    pageText: 'Explore careers. Market trader skills, salary and training.'
  }), false);
  assert.equal(hasUkActionableOpportunityEvidence({
    route: 'https://examplefestival.co.uk/traders',
    title: 'Trader applications',
    snippet: 'Applications are open for food traders.',
    pageText: 'Food traders can apply now for a pitch at the 2027 festival.'
  }), true);
});

test('UK opportunity-first lane accepts a private first-party market application page', async () => {
  const search = async () => [{
    rank: 1,
    title: 'Example Market Trader Applications',
    url: 'https://examplemarket.co.uk/traders',
    snippet: 'Trader applications open for our England market.'
  }];
  const fetchPage = async () => ({
    url: 'https://examplemarket.co.uk/traders',
    text: 'Example Market in England. Trader applications are open for our market. Apply to trade for a market stall or pitch.'
  });
  const result = await runUkOpportunityFirstDiscovery({}, {
    query_offset: 0,
    query_limit: 1,
    results_per_query: 1,
    candidate_limit: 1,
    as_of: '2026-09-17T20:00:00.000Z'
  }, { search, fetchPage });
  assert.equal(result.approved_count, 1);
  assert.equal(result.review_count, 0);
  assert.equal(result.approved_candidates[0].approval_status, 'approved');
});

test('US growth plan cannot starve a state merely because it has no seed sources', () => {
  const state = { code: 'WY', name: 'Wyoming', sources: [] };
  const plan = growthQueryPlan(state, { years: [2027] });
  assert.ok(plan.length >= 10);
  assert.ok(plan.some(item => item.query.includes('vendor applications')));
  const batch = growthQueryBatch(state, { years: [2027], offset: 0, limit: 8 });
  assert.equal(batch.length, 8);
});

test('UK cloud opportunity plan restores the productive Hal lane breadth', () => {
  const plan = buildUkOpportunityPlan();
  const queries = plan.map(item => item.query.toLowerCase());
  assert.ok(plan.length > 200);
  assert.ok(plan.some(item => item.lane_id === 'london-food-trucks'));
  assert.ok(queries.some(query => query.includes('county show')));
  assert.ok(queries.some(query => query.includes('agricultural show')));
  assert.ok(queries.some(query => query.includes('bonfire night')));
  assert.ok(queries.some(query => query.includes('marathon food vendor')));
  assert.ok(queries.some(query => query.includes('university') && query.includes('food')));
  assert.ok(queries.some(query => query.includes('brewery') && query.includes('food truck')));
  assert.ok(queries.some(query => query.includes('shopping centre') && query.includes('food')));
  assert.ok(queries.some(query => query.includes('private land') && query.includes('food truck')));
});
