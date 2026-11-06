// Independent L4 regression: one completed turn cannot certify a later interrupted turn.
// No subprocess, socket, model or database access. Intentionally fails on d66df5ba.
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyze} from '../../coordinator.mjs';
const event=(seq,kind,data)=>({seq,actor:'claude',kind,at:`2026-11-06T00:00:0${seq}Z`,refs:[],data});
test('L4: a larger earlier terminal result must not clear a later unfinished-turn lower bound',()=>{
 const events=[
  event(1,'note',{sessionId:'s',lowerBound:true,usage:{inputTokens:0,cacheCreationInputTokens:40,cacheReadInputTokens:450,outputTokens:10,totalTokens:500}}),
  event(2,'call',{permit:'a',interval:'active-turn',outcome:'completed',totalTokens:900,freshTokens:90}),
  // Message snapshots still contain the earlier turn's initial output, plus the new turn's partial usage.
  event(3,'note',{sessionId:'s',lowerBound:true,usage:{inputTokens:0,cacheCreationInputTokens:50,cacheReadInputTokens:530,outputTokens:20,totalTokens:600}}),
  event(4,'call',{permit:'b',interval:'active-turn',outcome:'interrupted',inputTokens:null,outputTokens:null,totalTokens:null,freshTokens:null})
 ];
 const report=analyze(events);
 assert.equal(report.usageLowerBound.claude,true,'turn b remains partial even though turn a total is larger than the summed snapshots');
});
