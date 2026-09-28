import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const script = readFileSync(new URL('../../operations/findpitches-v2/replay-legacy-pdfs.mjs', import.meta.url), 'utf8');

test('legacy PDF recovery does not use D1-incompatible LIKE or GLOB', () => {
  assert.doesNotMatch(script, /\\b(?:LIKE|GLOB)\\s+\\?/i);
  assert.match(script, /instr\\(q\\.last_error, 'findpitches_v2_fetch_content_type_unsupported:'\\) = 1/);
  assert.match(script, /instr\\(lower\\(q\\.last_error\\), 'pdf'\\) > 0/);
  assert.match(script, /instr\\(last_error, 'findpitches_v2_fetch_content_type_unsupported:'\\) = 1/);
});
