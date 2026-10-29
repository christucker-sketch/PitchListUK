import assert from 'node:assert/strict';
import { world, counts } from './helpers.mjs';
import { seed, snapshot, sha256, planBatch, ingestBatch, verifyPlanned } from '../scripts/bridge.mjs';
import { readPrivileges, principalProblems } from '../scripts/privileges.mjs';
const m={batch:'codex-extra-review',purpose:'offline review',seed:{kind:'question',title:'FindPitches review',body:'question'},selection:{search:'FindPitches',limit:20,maxDepth:2,maxResults:60},tasks:[{task:'MYC-20261029-001',agent:'claude'},{task:'MYC-20261029-002',agent:'codex'}]};
const w=await world();
try {
 const s=await seed(w.db,m,sha256(JSON.stringify(m))),snap=await snapshot(w.db,m.selection);
 const answer=(title,body)=>'```mycelium-contribution\n'+JSON.stringify({kind:'hypothesis',title,body,links:[{to:s.id,relation:'tests'}]})+'\n```';
 const a=[answer('first','safe'),answer('second','ghp_'+'A'.repeat(36))];
 const batch={batch:m.batch,commit:'a'.repeat(40),manifest_sha256:sha256(JSON.stringify(m)),snapshot_sha256:snap.sha256,items:m.tasks.map((t,i)=>({task:t.task,agent:t.agent,run:t.task+'-r1793280000-0a1b2c3d',descriptor_blob:'b'.repeat(40),result_blob:'c'.repeat(40),result_sha256:sha256(a[i])}))};
 const before=await counts(w.db);
 await assert.rejects(ingestBatch(w.db,m,batch,snap.text,a),/credential pattern/);
 const after=await counts(w.db);assert.equal(after.n,before.n+1);
 console.log('CONFIRMED: credential-pattern second answer passes planBatch then fails after first contribution commits');
 a[1]=answer('second','safe');batch.items[1].result_sha256=sha256(a[1]);await ingestBatch(w.db,m,batch,snap.text,a);
 const planned=planBatch(m,batch,snap.text,a);planned[0].c.body='DIFFERENT EXPECTED BODY';
 assert.deepEqual((await verifyPlanned(w.db,planned)).problems,[]);
 console.log('CONFIRMED: verifyPlanned reports exact success with mismatched expected body');
 await w.pg.query('SET SESSION AUTHORIZATION mycelium_bridge_fpd');
 const p=await readPrivileges(w.db);p.identity.connlimit=-1;p.identity.valid_until=null;
 assert.deepEqual(principalProblems(p,'mycelium_bridge_fpd'),[]);
 console.log('CONFIRMED: runtime privilege checker accepts no connection cap and no password expiry');
} finally {await w.pg.close();}
