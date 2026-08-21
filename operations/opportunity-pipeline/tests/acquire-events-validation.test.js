const test = require('node:test');
const assert = require('node:assert/strict');
const {
  emailFromMailto,
  prepareRowsForExport
} = require('../scripts/acquire-events');

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
