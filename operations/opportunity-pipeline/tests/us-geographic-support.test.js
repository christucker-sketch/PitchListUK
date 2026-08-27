const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normaliseUsZip,
  isTexasZip,
  resolveTexasZip,
  distanceFromTexasZip
} = require('../lib/us-zip-geography');

const { normalisePostcode, outcodeFrom } = require('../lib/geo-radius');

test('US ZIP normalisation accepts 5-digit and ZIP+4 only', () => {
  assert.equal(normaliseUsZip('78701'), '78701');
  assert.equal(normaliseUsZip('78701-1234'), '78701');
  assert.equal(normaliseUsZip(' 78701 '), '78701');
  assert.equal(normaliseUsZip('7870'), '');
  assert.equal(normaliseUsZip('SW1A 1AA'), '');
});

test('Texas ZIP detection uses Texas ZIP3 prefixes and fails closed', () => {
  assert.equal(isTexasZip('78701'), true);
  assert.equal(isTexasZip('77002'), true);
  assert.equal(isTexasZip('79901'), true);
  assert.equal(isTexasZip('73301'), true);
  assert.equal(isTexasZip('88510'), true);
  assert.equal(isTexasZip('10001'), false);
  assert.equal(isTexasZip('90210'), false);
  assert.equal(isTexasZip('nope'), false);
});

test('Texas resolver returns canonical international geography', () => {
  const resolved = resolveTexasZip('78701-9999');
  assert.ok(resolved);
  assert.equal(resolved.country_code, 'US');
  assert.equal(resolved.postal_code, '78701');
  assert.equal(resolved.locality, 'Austin');
  assert.equal(resolved.region_code, 'TX');
  assert.equal(resolved.region_name, 'Texas');
  assert.equal(resolved.coordinate_precision, 'postal');
  assert.ok(Number.isFinite(resolved.latitude));
  assert.ok(Number.isFinite(resolved.longitude));
});

test('resolver does not invent coordinates for unseeded ZIPs', () => {
  assert.equal(resolveTexasZip('78702'), null);
  assert.equal(resolveTexasZip('10001'), null);
});

test('resolver accepts an injected offline full ZIP index', () => {
  const index = {
    '78702': {
      city: 'Austin',
      state_code: 'TX',
      state_name: 'Texas',
      latitude: 30.2604,
      longitude: -97.7145,
      coordinate_source: 'test-offline-index'
    }
  };
  const resolved = resolveTexasZip('78702', { index });
  assert.equal(resolved.locality, 'Austin');
  assert.equal(resolved.coordinate_source, 'test-offline-index');
});

test('injected non-Texas index records are rejected even for a Texas-looking key', () => {
  const index = {
    '78702': {
      city: 'Austin',
      state_code: 'CA',
      latitude: 30.2604,
      longitude: -97.7145
    }
  };
  assert.equal(resolveTexasZip('78702', { index }), null);
});

test('distance from ZIP reuses the existing shared haversine maths', () => {
  const miles = distanceFromTexasZip('78701', {
    latitude: 30.2672,
    longitude: -97.7431
  });
  assert.ok(miles >= 0);
  assert.ok(miles < 2);
});

test('GB postcode helpers remain unchanged and separate from US ZIP parsing', () => {
  assert.equal(normalisePostcode('SW1A 1AA'), 'SW1A1AA');
  assert.equal(outcodeFrom('SW1A 1AA'), 'SW1A');
  assert.equal(normaliseUsZip('SW1A 1AA'), '');
});
