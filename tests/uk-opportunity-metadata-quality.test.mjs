import assert from 'node:assert/strict';
import test from 'node:test';

import sourcesLib from '../operations/opportunity-pipeline/config/sources.js';
import extractLib from '../operations/opportunity-pipeline/acquisition/extract.js';
import safetyLib from '../operations/opportunity-pipeline/lib/opportunity-safety.js';

const { sourceRuleFor } = sourcesLib;
const { sourceCandidateToRow } = extractLib;
const { evaluateOpportunity } = safetyLib;

const BLUE_REEF_URL = 'https://bluereeffestival.co.uk/caterers';

test('Blue Reef approved source carries customer-facing festival metadata and dates', () => {
  const rule = sourceRuleFor(BLUE_REEF_URL);
  assert.equal(rule.organisation, 'Blue Reef Festival');
  assert.equal(rule.opportunity_title, 'Blue Reef Festival 2026 caterer applications');
  assert.equal(rule.known_open_event_start, '2026-07-24');
  assert.equal(rule.known_open_event_end, '2026-07-25');

  const staged = sourceCandidateToRow({
    url: BLUE_REEF_URL,
    title: 'Caterers',
    snippet: 'Blue Reef Festival 2026 caterer application form. Apply for a catering pitch.',
    query: 'Kent festival caterer application 2026',
    query_lane: 'uk-opportunity-test'
  }, '<html><body>Blue Reef Festival 2026 Caterer Application Form. Apply for a catering pitch. 24th to 25th July 2026.</body></html>', '2026-10-02');

  assert.equal(staged.event_name, 'Blue Reef Festival 2026 caterer applications');
  assert.equal(staged.organiser, 'Blue Reef Festival');
  assert.equal(staged.event_start, '2026-07-24');
  assert.equal(staged.event_end, '2026-07-25');
});

test('generic customer-facing event or organiser names fail closed', () => {
  const reviewed = evaluateOpportunity({
    event_name: 'Caterers',
    organiser: 'Caterers',
    source_url: BLUE_REEF_URL,
    application_url: BLUE_REEF_URL,
    source_evidence: 'Apply for a caterer pitch at Blue Reef Festival 2026.',
    location: 'Kent',
    region: 'Kent',
    event_start: '',
    event_end: '',
    application_deadline: '',
    query_lane: 'uk-opportunity-test',
    query_text: 'Kent festival caterer application 2026'
  }, { now: new Date('2026-10-02T00:00:00Z') });

  assert.equal(reviewed.quality_status, 'needs_work');
  assert.equal(reviewed.publishable, false);
  assert.ok(reviewed.quality_reasons.includes('named_organiser_missing'));
});
