import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const script = readFileSync(new URL('../../operations/findpitches-v2/replay-legacy-pdfs.mjs', import.meta.url), 'utf8');

test('replay uses bounded instr-based D1 matching and no parameterized LIKE', () => {
  assert.equal(script.includes('last_error LIKE ?'), false);
  assert.equal(script.includes('last_error GLOB ?'), false);
  assert.ok(script.includes("instr(q.last_error, 'findpitches_v2_fetch_content_type_unsupported:') = 1"));
  assert.ok(script.includes("instr(lower(q.last_error), 'pdf') > 0"));
  assert.ok(script.includes("instr(last_error, 'findpitches_v2_fetch_content_type_unsupported:') = 1"));
});
