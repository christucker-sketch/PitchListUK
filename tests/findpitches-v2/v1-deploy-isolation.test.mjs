import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('../../.github/workflows/verify.yml',import.meta.url),'utf8');

test('v2 platform paths are explicitly skipped before the v1 platform catch-all',()=>{
  const frontend=source.slice(source.indexOf('  frontend_changes:'),source.indexOf('  deploy_frontend_production:'));
  const skip=frontend.indexOf('platform/findpitches-v2/*)');
  const legacy=frontend.indexOf('src/*|platform/*|');
  assert.ok(skip!==-1 && legacy!==-1 && skip<legacy,'v2 skip must precede legacy catch-all');
  assert.match(frontend.slice(skip,legacy),/continue\s*;;/);
});

test('editing this workflow alone does not deploy v1 Pages or the legacy acquisition Worker',()=>{
  const frontend=source.slice(source.indexOf('  frontend_changes:'),source.indexOf('  deploy_frontend_production:'));
  const acquisition=source.slice(source.indexOf('  acquisition_worker_changes:'),source.indexOf('  deploy_acquisition_worker_production:'));
  assert.ok(!frontend.includes('|.github/workflows/verify.yml)'));
  assert.ok(!acquisition.includes('|.github/workflows/verify.yml)'));
});
