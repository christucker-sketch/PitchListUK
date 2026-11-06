// Full worker/coordinator/RPC pipeline, fake CLI, no model/network/Neon. Async Git setup avoids managed spawnSync limits.
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {fileURLToPath} from 'node:url';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {runSession} from '../../coordinator.mjs';
const exec=promisify(execFile),tmp=prefix=>mkdtempSync(join(tmpdir(),prefix));
async function run(cap){
 const repo=tmp('fresh-runtime-repo-'),g=(...args)=>exec('git',args,{cwd:repo});
 await g('init','-qb','main');await g('config','user.name','offline');await g('config','user.email','offline@invalid');
 mkdirSync(join(repo,'artifact'));writeFileSync(join(repo,'artifact/README'),'offline fixture');await g('add','-A');await g('commit','-qm','fixture');
 return runSession({id:'fresh-review-'+cap,dir:tmp('fresh-runtime-'),repo,
 agents:{claude:{adapter:'fake',script:[{call:300},{done:'done'}]},codex:{adapter:'codex-app-server',prompt:'offline',maxDeliveries:0,launch:{command:[process.execPath,fileURLToPath(new URL('../../test/fixtures/fresh-codex-app-server.mjs',import.meta.url))]}}},
 limits:{maxWallMs:5000,graceMs:100,maxCallsPerAgent:1,maxFreshTokensPerAgent:cap}});
}
test('P1 runtime: terminal record preserves 35,481 fresh and 230,937 total; no false 200k fresh stop',async()=>{
 const r=await run(200000);assert.equal(r.events.some(e=>e.kind==='stop'),false,JSON.stringify(r.events.filter(e=>e.kind==='stop'||e.kind==='exit')));
 assert.equal(r.report.freshUsage.codex,35481);assert.equal(r.report.usage.codex,230937);
 const call=r.events.find(e=>e.actor==='codex'&&e.kind==='call');assert.equal(call.data.freshTokens,35481);assert.equal(call.data.totalTokens,230937);
});
test('P1 runtime: an actually exceeded fresh threshold still stops the pair',async()=>{
 const r=await run(30000);assert.ok(r.events.some(e=>e.kind==='stop'&&/codex fresh tokens 35481 reached the 30000/.test(e.body)));
 assert.equal(r.report.freshUsage.codex,35481);
});
