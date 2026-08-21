const test = require('node:test');
const assert = require('node:assert/strict');
const {
  haversineMiles,
  normalisePostcode,
  outcodeFrom,
  resolvePostcode,
  rowCoordinates
} = require('../lib/geo-radius');

test('normalises postcodes and extracts outcodes', () => {
  assert.equal(normalisePostcode(' ls1 1aa '), 'LS11AA');
  assert.equal(outcodeFrom('LS1 1AA'), 'LS1');
  assert.equal(outcodeFrom('SW1A 1AA'), 'SW1A');
});

test('calculates approximate mileage between coordinates', () => {
  const leeds = { latitude: 53.8008, longitude: -1.5491 };
  const london = { latitude: 51.5072, longitude: -0.1276 };
  const miles = haversineMiles(leeds, london);
  assert.equal(Math.round(miles), 169);
});

test('resolves postcodes via injected fetcher', async () => {
  const resolved = await resolvePostcode('LS1', {
    fetch: async () => ({
      ok: true,
      json: async () => ({ result: { latitude: 53.797, longitude: -1.543 } })
    })
  });
  assert.equal(resolved.outcode, 'LS1');
  assert.equal(resolved.source, 'postcodes.io/outcode');
  assert.equal(resolved.latitude, 53.797);
});

test('row coordinates prefer explicit values over place and area centroids', () => {
  const coords = rowCoordinates({
    event_name: 'Leeds Christmas Market',
    region: 'Yorkshire & The Humber',
    county: 'West Yorkshire',
    latitude: '53.8100',
    longitude: '-1.5500'
  });

  assert.equal(coords.source, 'row');
  assert.equal(coords.precision, 'exact');
  assert.equal(coords.latitude, 53.81);
});

test('row coordinates use known place centroids before broad area centroids', () => {
  const coords = rowCoordinates({
    event_name: 'Knutsford Christmas Market',
    location: 'Cheshire',
    region: 'Cheshire',
    county: 'Cheshire'
  });

  assert.equal(coords.source, 'place-centroid');
  assert.equal(coords.precision, 'place');
  assert.equal(coords.label, 'Knutsford');
});

test('row coordinates fall back to area centroids when no place is known', () => {
  const coords = rowCoordinates({
    event_name: 'Regional Food Fair',
    location: 'West Yorkshire',
    region: 'West Yorkshire',
    county: 'West Yorkshire'
  });

  assert.equal(coords.source, 'area-centroid');
  assert.equal(coords.precision, 'area');
  assert.equal(coords.label, 'West Yorkshire');
});
