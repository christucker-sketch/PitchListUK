import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceDomain } from '../../platform/findpitches-v2/acquisition/storage.mjs';

test('sourceDomain normalises useful source hosts', () => {
  assert.equal(sourceDomain('https://www.example.org/vendors/apply?year=2027'), 'example.org');
  assert.equal(sourceDomain('https://markets.example.com/vendor'), 'markets.example.com');
});

test('sourceDomain fails closed for invalid/non-public-looking values', () => {
  assert.equal(sourceDomain('not a url'), null);
  assert.equal(sourceDomain('https://localhost/vendor'), null);
  assert.equal(sourceDomain(''), null);
});
