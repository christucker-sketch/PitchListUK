import test from 'node:test';
import assert from 'node:assert/strict';
import { TEXAS_PILOT_EVIDENCE } from '../config/texas-pilot-evidence.js';

test('Texas pilot evidence metadata forbids publication', () => {
  assert.equal(TEXAS_PILOT_EVIDENCE.researched_at, '2026-08-27');
  assert.equal(TEXAS_PILOT_EVIDENCE.publication_mode, 'none');
});
