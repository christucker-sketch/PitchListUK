import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {manifest,files,prompt} from '../scenarios/breadcrumb-proof.mjs';
test('pinned candidate manifest exactly matches source, with equal-status prompts and billing-guard commands',()=>{
 const m=manifest();assert.deepEqual(JSON.parse(fs.readFileSync(new URL('../proof/first-live.candidate.json',import.meta.url))),m);
 for(const a of ['claude','codex']){assert.equal(m.agents[a].prompt,prompt);assert.equal(m.agents[a].maxDeliveries,5);assert.equal(m.agents[a].maxContextBytes,24000);}
 assert.deepEqual(m.agents.codex.launch.command,['/home/myc/bin/myc-run','codex','app-server','--listen','stdio://']);
 assert.deepEqual(m.agents.claude.command,['/home/myc/bin/myc-run','claude']);
});
test('candidate retains exact approved action/time limits and required base protection',()=>{
 const m=manifest();assert.equal(m.limits.maxCallsPerAgent*2,12);assert.equal(m.limits.maxWallMs,600000);assert.equal(m.limits.graceMs,5000);assert.equal(m.limits.requireBase,true);assert.equal(m.limits.maxObservedTokens,20000);assert.equal(m.sandbox,'systemd');assert.equal(m.launcher.mode,'systemd-scope');
});
test('fixed acceptance tests live outside model-write allowlist; no network workload or predefined discovery lanes',()=>{
 assert.ok(files['checks/frontier.test.mjs']);assert.ok(files['artifact/pages.json'].includes('出店'));
 assert.deepEqual(manifest().testCmd,['/usr/local/bin/node','--test','checks/frontier.test.mjs']);
 assert.equal(Object.keys(files).filter(p=>!p.startsWith('artifact/')&&!p.startsWith('checks/')).length,0);
 assert.ok(!('env' in manifest().agents.codex));
});
