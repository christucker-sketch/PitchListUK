// Actual worker/coordinator/Git + fake CLI + real sandbox. No model calls.
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {fileURLToPath} from 'node:url';
import {runSession} from '../../coordinator.mjs';import {sandboxAvailable} from '../../sandbox.mjs';
const exec=promisify(execFile),temp=s=>mkdtempSync(join(tmpdir(),s));
test('offline process recovery: sixth grant, late durable inbox, invalid/stale submit, actual merge/tests and clean completion',
 {skip:!sandboxAvailable('unshare')&&'requires existing working unshare sandbox; no bypass'},async()=>{
 const repo=temp('recovery-repo-'),git=(...a)=>exec('git',a,{cwd:repo});
 await git('init','-qb','main');await git('config','user.name','offline');await git('config','user.email','offline@invalid');
 mkdirSync(join(repo,'artifact'));mkdirSync(join(repo,'checks'));writeFileSync(join(repo,'artifact/x.mjs'),'export const x=0;\n');
 writeFileSync(join(repo,'checks/x.test.mjs'),"import test from 'node:test';import assert from 'node:assert/strict';import {x} from '../artifact/x.mjs';test('actual integration',()=>assert.equal(x,1));\n");
 await git('add','-A');await git('commit','-qm','fixture');
 const script=[{call:500}];for(let n=0;n<5;n++)script.push({emit:'finding',body:'early'+n},{busy:150});
 script.push({busy:300},{emit:'challenge',body:'late recovery counterexample'},{busy:3000},{done:'fake peer completed'});
 const r=await runSession({id:'offline-recovery',dir:temp('recovery-run-'),repo,sandbox:'unshare',testCmd:[process.execPath,'--test','checks/x.test.mjs'],
  agents:{claude:{adapter:'fake',script},codex:{adapter:'codex-app-server',prompt:'offline protocol rehearsal',maxDeliveries:5,maxContextBytes:24000,
   launch:{command:[process.execPath,fileURLToPath(new URL('../../test/fixtures/recovery-codex-app-server.mjs',import.meta.url))]}}},
  limits:{maxWallMs:15000,graceMs:200,maxCallsPerAgent:6}});
 assert.equal(r.events.filter(e=>e.kind==='grant'&&e.data?.agent==='codex').length,6);
 assert.equal(r.events.some(e=>e.kind==='stop'),false,JSON.stringify(r.events.filter(e=>['stop','exit','error'].includes(e.kind))));
 assert.ok(r.events.some(e=>e.actor==='codex'&&e.kind==='reply'&&e.body.startsWith('recovered:')));
 assert.equal(r.report.finalIntegration.ok,true);assert.equal(r.report.finalIntegration.tested,true);
 assert.ok(r.events.some(e=>e.kind==='refused'&&e.data?.stale));
});
