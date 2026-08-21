import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('versioned opportunity pipeline suite passes in the root CI test command', () => {
  const result = spawnSync(process.execPath, ['--test', 'operations/opportunity-pipeline/tests/*.test.js'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    shell: true,
    env: { ...process.env }
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
