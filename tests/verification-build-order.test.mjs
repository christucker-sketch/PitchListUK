import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflow = fs.readFileSync('.github/workflows/verify.yml', 'utf8');

test('verification rebuilds deterministic public output before site validation', () => {
  const verifyJobStart = workflow.indexOf('  verify:');
  const nextJobStart = workflow.indexOf('\n  acquisition_worker_changes:', verifyJobStart);
  assert.ok(verifyJobStart >= 0, 'verify job must exist');
  assert.ok(nextJobStart > verifyJobStart, 'verify job boundary must exist');

  const verifyJob = workflow.slice(verifyJobStart, nextJobStart);
  const buildIndex = verifyJob.indexOf('npm run build');
  const checkIndex = verifyJob.indexOf('node scripts/check.js');

  assert.ok(buildIndex >= 0, 'verify job must build deterministic public output');
  assert.ok(checkIndex >= 0, 'verify job must run site validation');
  assert.ok(buildIndex < checkIndex, 'deterministic build must happen before validation');
});
