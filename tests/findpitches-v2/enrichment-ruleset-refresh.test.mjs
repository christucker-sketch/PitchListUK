import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {enqueueEnrichmentRulesetRefresh} from '../../platform/findpitches-v2/enrichment/run-batch.mjs';

function mockDb({currentVersion=null,sweepValue=null,sweepVersion=null,candidates=[]}={}){
 const calls=[];
 return {
  calls,
  prepare(sql){
   return {
    args:[],
    bind(...args){this.args=args;return this;},
    async first(){
     calls.push({kind:'first',sql,args:this.args});
     if(/FROM runtime_meta WHERE key=\?/.test(sql)){
      if(this.args[0]==='enrichment_ruleset_version') return currentVersion?{value:currentVersion}:null;
      if(this.args[0]==='enrichment_ruleset_sweep_started_at') return sweepValue?{value:sweepValue}:null;
      if(this.args[0]==='enrichment_ruleset_sweep_version') return sweepVersion?{value:sweepVersion}:null;
     }
     return null;
    },
    async all(){
     calls.push({kind:'all',sql,args:this.args});
     return {results:candidates};
    },
    async run(){
     calls.push({kind:'run',sql,args:this.args});
     return {meta:{changes:1}};
    }
   };
  }
 };
}

test('ruleset refresh requeues only bounded pre-sweep validated enrichment and stamps source revision',async()=>{
 const db=mockDb({candidates:[{id:'c1',last_checked:'2026-09-29T10:00:00Z'}]});
 const now=new Date('2026-09-30T06:00:00Z');
 const result=await enqueueEnrichmentRulesetRefresh(db,{now,limit:3,ruleset:'evidence-v2'});
 assert.equal(result.ruleset,'evidence-v2');
 assert.equal(result.enqueued,1);
 assert.equal(result.complete,false);
 const select=db.calls.find(x=>x.kind==='all');
 assert.match(select.sql,/c\.status='validated'/);
 assert.match(select.sql,/e\.enriched_at<\?/);
 assert.match(select.sql,/q\.status!='leased'/);
 assert.equal(select.args.at(-1),3);
 const queueWrite=db.calls.find(x=>x.kind==='run'&&/INSERT INTO enrichment_queue/.test(x.sql));
 assert.ok(queueWrite);
 assert.equal(queueWrite.args[0],'c1');
 assert.equal(queueWrite.args[2],'ruleset_refresh:evidence-v2');
 assert.equal(queueWrite.args[3],'2026-09-29T10:00:00Z');
});

test('completed ruleset and zero spare capacity do not enqueue refresh work',async()=>{
 const complete=mockDb({currentVersion:'evidence-v2'});
 const done=await enqueueEnrichmentRulesetRefresh(complete,{ruleset:'evidence-v2',limit:8});
 assert.deepEqual(done,{ruleset:'evidence-v2',enqueued:0,complete:true});
 assert.equal(complete.calls.some(x=>x.kind==='all'),false);

 const paused=mockDb({sweepValue:'2026-09-30T06:00:00Z'});
 const noSpare=await enqueueEnrichmentRulesetRefresh(paused,{ruleset:'evidence-v2',limit:0});
 assert.equal(noSpare.enqueued,0);
 assert.equal(noSpare.complete,false);
 assert.equal(paused.calls.some(x=>x.kind==='all'),false);
});

test('enrichment worker reserves bounded capacity for practical-location refreshes',async()=>{
 const worker=await fs.readFile(new URL('../../operations/findpitches-v2-enrichment/worker/index.mjs',import.meta.url),'utf8');
 assert.match(worker,/ENRICHMENT_RULESET_VERSION='2026-09-30-practical-location-v1'/);
 assert.match(worker,/FRESH_ENQUEUE_LIMIT=8/);
 assert.match(worker,/RULESET_REFRESH_LIMIT=4/);
 assert.match(worker,/BATCH_LIMIT=12/);
 assert.match(worker,/enqueueValidatedForEnrichment\(env\.FINDPITCHES_DB,\{now,limit:FRESH_ENQUEUE_LIMIT/);
 assert.match(worker,/enqueueEnrichmentRulesetRefresh\(env\.FINDPITCHES_DB,\{now,limit:RULESET_REFRESH_LIMIT/);
});


test('new ruleset version resets the historical sweep cursor once',async()=>{
 const db=mockDb({currentVersion:'old-v1',sweepValue:'2026-09-29T06:00:00Z',sweepVersion:'old-v1',candidates:[]});
 const now=new Date('2026-09-30T07:00:00Z');
 const result=await enqueueEnrichmentRulesetRefresh(db,{now,limit:4,ruleset:'new-v2'});
 assert.equal(result.complete,true);
 const sweepVersionWrite=db.calls.find(x=>x.kind==='run'&&x.args[0]==='enrichment_ruleset_sweep_version');
 const sweepTimeWrite=db.calls.find(x=>x.kind==='run'&&x.args[0]==='enrichment_ruleset_sweep_started_at');
 assert.ok(sweepVersionWrite);
 assert.ok(sweepTimeWrite);
 assert.equal(sweepVersionWrite.args[1],'new-v2');
 assert.equal(sweepTimeWrite.args[1],'2026-09-30T07:00:00.000Z');
 const completed=db.calls.find(x=>x.kind==='run'&&x.args[0]==='enrichment_ruleset_version');
 assert.ok(completed);
 assert.equal(completed.args[1],'new-v2');
});
