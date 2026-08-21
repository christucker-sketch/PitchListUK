import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { parseJsonOutput } = require('../scripts/run-approved-source-growth.js');

test('growth runner extracts the final publisher receipt after deployment diagnostics', () => {
  assert.deepEqual(parseJsonOutput('{"ok":true}'), { ok: true });
  assert.deepEqual(parseJsonOutput('wrangler output\nmore output\n{\n  "published": true,\n  "after_count": 280\n}'), { published: true, after_count: 280 });
  assert.throws(() => parseJsonOutput('no json'), /invalid/);
});
