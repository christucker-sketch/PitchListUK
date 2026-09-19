import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const ROOTS = ['platform/findpitches-v2', 'operations/findpitches-v2'];
const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.json', '.jsonc', '.md', '.sql', '.toml', '.yml', '.yaml']);
const FORBIDDEN = [
  /pitchlist/i,
  /\/home\/ct_admin/i,
  /cloudflare-global-acquisition/i,
  /cloudflare-texas-acquisition/i,
  /cloudflare-uk-canary/i
];

async function walk(path) {
  const entries = await readdir(path, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) files.push(...await walk(child));
    else if (TEXT_EXTENSIONS.has(extname(entry.name))) files.push(child);
  }
  return files;
}

test('v2 partition contains no legacy branding, local paths or legacy runtime references', async () => {
  const violations = [];

  for (const root of ROOTS) {
    for (const file of await walk(root)) {
      const content = await readFile(file, 'utf8');
      for (const pattern of FORBIDDEN) {
        if (pattern.test(content)) violations.push(`${relative('.', file)} matched ${pattern}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});
