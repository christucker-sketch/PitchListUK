import test from 'node:test';
import assert from 'node:assert/strict';
import { TEXAS_PILOT_SOURCES, TEXAS_PILOT_EXCLUSIONS } from '../config/texas-pilot-sources.js';

test('Texas pilot contains only reviewed US-TX first-party opportunity sources', () => {
  assert.equal(TEXAS_PILOT_SOURCES.length, 12);
  for (const source of TEXAS_PILOT_SOURCES) {
    assert.equal(source.country_code, 'US');
    assert.equal(source.region_code, 'TX');
    assert.equal(source.jurisdiction, 'US-TX');
    assert.equal(source.status, 'approved-pilot');
    assert.match(source.source_url, /^https:\/\//);
    assert.match(source.application_url, /^https:\/\//);
    assert.ok(source.organiser);
    assert.ok(source.evidence);
  }
});

test('Texas pilot source IDs and source URLs are unique', () => {
  assert.equal(new Set(TEXAS_PILOT_SOURCES.map(source => source.id)).size, TEXAS_PILOT_SOURCES.length);
  assert.equal(new Set(TEXAS_PILOT_SOURCES.map(source => source.source_url)).size, TEXAS_PILOT_SOURCES.length);
});

test('regulatory licensing is explicitly excluded from opportunity intake', () => {
  assert.ok(TEXAS_PILOT_EXCLUSIONS.some(item => item.reason === 'regulatory-licensing-not-opportunity'));
  assert.ok(TEXAS_PILOT_EXCLUSIONS.every(item => !TEXAS_PILOT_SOURCES.some(source => source.source_url === item.url)));
});
