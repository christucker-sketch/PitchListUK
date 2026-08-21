const test = require('node:test');
const assert = require('node:assert/strict');
const {
  emailFromMailto,
  prepareRowsForExport
} = require('../scripts/acquire-events');
const { sourceCandidateToRow, nextFutureDate } = require('../acquisition/extract');

function baseRow(overrides = {}) {
  return {
    event_name: 'Example Food Festival',
    organiser: 'Example Organiser',
    source_url: 'https://example.com/traders',
    application_url: 'https://example.com/apply',
    contact_email: '',
    location: 'Bristol',
    region: 'Bristol',
    event_start: '2026-08-01',
    event_end: '',
    application_deadline: '',
    stall_fee: '',
    vendor_categories: 'food traders',
    last_checked: '2026-07-18',
    confidence: 'medium',
    notes: 'Test row',
    ...overrides
  };
}

test('extracts email addresses from mailto application routes', () => {
  assert.equal(
    emailFromMailto('mailto:traders@example.com?Subject=&Body='),
    'traders@example.com'
  );
});

test('normalises mailto application routes without quarantining the row', () => {
  const prepared = prepareRowsForExport([
    baseRow({
      application_url: 'mailto:traders@example.com?Subject=&Body='
    })
  ]);

  assert.equal(prepared.rows.length, 1);
  assert.equal(prepared.validationErrors.length, 0);
  assert.equal(prepared.quarantinedRows.length, 0);
  assert.equal(prepared.rows[0].application_url, 'https://example.com/traders');
  assert.equal(prepared.rows[0].contact_email, 'traders@example.com');
});

test('quarantines invalid rows while keeping valid rows exportable', () => {
  const prepared = prepareRowsForExport([
    baseRow(),
    baseRow({
      event_name: 'Bad Row',
      source_url: 'not-a-url'
    })
  ]);

  assert.equal(prepared.rows.length, 1);
  assert.equal(prepared.validationErrors.length, 1);
  assert.equal(prepared.quarantinedRows.length, 1);
  assert.equal(prepared.quarantinedRows[0].row.event_name, 'Bad Row');
});

test('extractor uses a reviewed source organisation and never trusts a search title as organiser', () => {
  const html = '<html><body><h1>Apply for a street trading pitch</h1><a href="/apply">Apply</a></body></html>';
  const approved = sourceCandidateToRow({ url: 'https://bristol.gov.uk/business/street-trading', title: 'SEO search title', snippet: 'Apply for a pitch', query_lane: 'county-bristol', query: 'test' }, html, '2026-08-21');
  const unknown = sourceCandidateToRow({ url: 'https://unknown.example/traders', title: 'Plausible Event Organiser', snippet: 'Apply for a pitch', query_lane: 'manual', query: 'test' }, html, '2026-08-21');
  assert.equal(approved.organiser, 'Bristol City Council');
  assert.equal(unknown.organiser, '');
});

test('extractor uses the versioned complete UK region list', () => {
  const row = sourceCandidateToRow({ url: 'https://durham.gov.uk/markets', title: 'Durham market', snippet: 'County Durham trader applications', query_lane: 'county-county-durham', query: 'test' }, '<p>Market traders in County Durham can apply.</p><a href="/apply">Apply</a>', '2026-08-21');
  assert.equal(row.region, 'County Durham');
  assert.equal(row.location, 'County Durham');
});

test('source-specific recurring identities ignore page-furniture dates and pagination', () => {
  const html = '<p>Past event 1 April 2026. Apply for a market stall at our recurring markets.</p>';
  const first = sourceCandidateToRow({ url: 'https://www.rotherham.gov.uk/markets/apply-market-street-trader-licence/2', title: 'Page 2', snippet: 'Apply for a stall', query_lane: 'weak-regions-first-party-applications', query: 'test' }, html, '2026-08-21');
  const second = sourceCandidateToRow({ url: 'https://www.rotherham.gov.uk/markets/apply-market-street-trader-licence/3', title: 'Page 3', snippet: 'Apply for a stall', query_lane: 'weak-regions-first-party-applications', query: 'test' }, html, '2026-08-21');
  assert.equal(first.source_url, second.source_url);
  assert.equal(first.event_name, 'Rotherham market trader applications');
  assert.equal(first.region, 'South Yorkshire');
  assert.equal(first.event_start, '');
});

test('festival source selects the next future event date rather than a passed date', () => {
  assert.equal(nextFutureDate('25 April 2026, 4 July 2026, 26 September 2026 and 5 December 2026', '2026-08-21'), '2026-09-26');
});
