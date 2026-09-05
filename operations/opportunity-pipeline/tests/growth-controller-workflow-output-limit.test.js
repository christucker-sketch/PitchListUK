import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(
  new URL('../../cloudflare-texas-acquisition/scripts/growth-controller-core.mjs', import.meta.url),
  'utf8'
);

test('growth controller raises Wrangler Workflow describe truncation limit', () => {
  assert.match(source, /workflows', 'instances', 'describe'[\s\S]*'--truncate-output-limit'[\s\S]*String\(outputLimit\)/);
  assert.match(source, /PITCHLIST_GROWTH_WORKFLOW_OUTPUT_LIMIT\s*\|\|\s*65536/);
});
