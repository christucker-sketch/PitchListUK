const test = require('node:test');
const assert = require('node:assert/strict');
const { inferKnownCounty, normaliseCounty } = require('../lib/geo-normalise');

test('infers known counties from town and event clues', () => {
  assert.equal(inferKnownCounty('Apply to Trade at Knutsford Christmas Market'), 'Cheshire');
  assert.equal(inferKnownCounty('Bedford River Festival expressions of interest'), 'Bedfordshire');
  assert.equal(inferKnownCounty('Caterer & Trader Applications - Cambridge Folk Festival'), 'Cambridgeshire');
  assert.equal(inferKnownCounty('STALLHOLDER APPLICATION FORM THE BILLINGHAM SHOW 2026'), 'County Durham');
});

test('normaliseCounty keeps legacy fallback while known inference stays strict', () => {
  assert.equal(inferKnownCounty('Completely Unmapped Event'), 'Unknown');
  assert.equal(normaliseCounty('Completely Unmapped Event'), 'Completely Unmapped Event');
});
