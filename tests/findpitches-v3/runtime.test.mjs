import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { runPreservationControl } from '../../operations/findpitches-v3/control.mjs';
import { record } from './helpers.mjs';

const require=createRequire(process.env.V3_TOOLING_ROOT?path.join(process.env.V3_TOOLING_ROOT,'package.json'):new URL('../../operations/findpitches-v3/package.json',import.meta.url));
test('real workerd D1 executes all migrations, preservation control and native queue stage chain',{timeout:360000},async t=>{
  const {Miniflare,convertV4MiniflareOptions}=require('miniflare'),{buildSync}=require('esbuild'),{unstable_splitSqlQuery}=require('wrangler');
  const root=filePath(new URL('../../',import.meta.url)),script=buildSync({entryPoints:[path.join(root,'platform/findpitches-v3/worker.mjs')],bundle:true,format:'esm',platform:'browser',write:false}).outputFiles[0].text;
  const token='local-runtime-test-token-at-least-24-chars';
  const roles=['ingest','reconcile','eligibility','enrichment','readiness','acquisition','watch','api'];
  const workers=roles.map(role=>{
    const c=JSON.parse(fs.readFileSync(path.join(root,'operations/findpitches-v3/cloudflare',role+'.jsonc'),'utf8'));
    return {name:role,modules:true,script,compatibilityDate:c.compatibility_date,bindings:{...c.vars,V3_INGEST_TOKEN:token,V3_OPERATOR_TOKEN:token},d1Databases:{FINDPITCHES_V3_DB:'v3-runtime-test'},
      queueProducers:Object.fromEntries((c.queues?.producers??[]).map(q=>[q.binding,q.queue])),
      queueConsumers:Object.fromEntries((c.queues?.consumers??[]).map(q=>[q.queue,{maxBatchSize:10,maxBatchTimeout:0,maxRetries:1,deadLetterQueue:q.dead_letter_queue}]))};
  });
  const mf=new Miniflare(convertV4MiniflareOptions({workers}));t.after(()=>mf.dispose());
  const db=await mf.getD1Database('FINDPITCHES_V3_DB','api');
  const migration=fs.readFileSync(path.join(root,'operations/findpitches-v3/migrations/0001_evidence_platform.sql'),'utf8');
  for(const query of unstable_splitSqlQuery(migration))await db.prepare(query).run();
  const fixture=JSON.parse(fs.readFileSync(path.join(root,'tests/findpitches-v3/fixtures/structured-control-100.json'),'utf8'));
  const control=await runPreservationControl(db,fixture.records,{progress:message=>console.log('Native D1:',message)});assert.equal(control.destructive_mutations,0);assert.equal(control.replay_new_entities,0);
  const ingest=await mf.getWorker('ingest'),api=await mf.getWorker('api');
  const imported=await ingest.fetch('https://example.test/imports',{method:'POST',headers:{authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({records:[record({opportunity_id:'native-queue',application_url:'https://www.eventeny.com/events/vendor/?id=88888',canonical_url:'https://www.eventeny.com/events/vendor/?id=88888'})]})});
  assert.equal(imported.status,202,await imported.clone().text());
  const deadline=Date.now()+20000;let row;
  do {row=await db.prepare("SELECT e.id FROM entities e JOIN readiness r ON r.entity_id=e.id WHERE e.environment='shadow'").first();if(!row)await new Promise(resolve=>setTimeout(resolve,100));}while(!row&&Date.now()<deadline);
  assert.ok(row,'Native queue delivery must finish the shadow pipeline');
  const response=await api.fetch('https://example.test/shadow',{headers:{authorization:'Bearer '+token}});assert.equal(response.status,200);assert.ok((await response.json()).items.some(r=>r.id===row.id));
  assert.equal((await api.fetch('https://example.test/v1/opportunities')).status,403);
  console.log('Real D1/workerd control:',JSON.stringify({...control,record_ids:undefined}));
});
function filePath(url){return decodeURIComponent(url.pathname);}
