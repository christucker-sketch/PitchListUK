// Offline scripted CLI: real worker/coordinator integration, never launches a model.
import {createInterface} from 'node:readline';
import assert from 'node:assert/strict';
const send=m=>process.stdout.write(JSON.stringify(m)+'\n');
let id=1000,steers=0,start,pending=new Map();
const ready=new Promise(r=>start=r),sleep=ms=>new Promise(r=>setTimeout(r,ms));
function tool(name,args){const n=id++;return new Promise((resolve,reject)=>{pending.set(n,{resolve,reject});send({id:n,method:'item/tool/call',params:{threadId:'t',turnId:'u',callId:'c'+n,tool:name,arguments:args}});});}
const value=r=>{assert.equal(r.success,true);return JSON.parse(r.contentItems[0].text);};
async function main(){
 await ready;
 let late;
 for(let n=0;n<20&&!late;n++){const r=value(await tool('myc_inbox',{}));late=r.events.find(e=>e.body==='late recovery counterexample');if(!late)await sleep(100);}
 assert.ok(late,'late peer event must arrive after five steers without a new grant');
 assert.equal((await tool('myc_submit',{files:[null],refIds:[],message:'bad'})).success,false);
 const head=value(await tool('myc_read',{headOnly:true})).integration;
 const args={base:'0'.repeat(40),files:[{path:'artifact/x.mjs',content:'export const x=1;\n'}],message:'recovered submission',refIds:[late.id]};
 assert.equal((await tool('myc_submit',args)).success,false);
 value(await tool('myc_submit',{...args,base:head}));
 let latest;
 for(let n=0;n<20&&!latest;n++){const r=value(await tool('myc_inbox',{}));latest=r.events.find(e=>e.kind==='tested'&&e.data?.ok===true);if(!latest)await sleep(100);}
 assert.ok(latest,'latest integration must have actual sandboxed test receipt');
 value(await tool('myc_publish',{kind:'reply',body:'recovered: read late peer and latest integration PASS after steering cap',refIds:[late.id,latest.id]}));
 send({method:'turn/completed',params:{threadId:'t',turn:{id:'u',status:'completed'}}});
 setTimeout(()=>process.exit(0),200);
}
createInterface({input:process.stdin}).on('line',line=>{
 const m=JSON.parse(line);
 if(m.method==='initialize')send({id:m.id,result:{}});
 else if(m.method==='thread/start')send({id:m.id,result:{thread:{id:'t'},activePermissionProfile:{id:m.params.permissions},cwd:m.params.cwd,approvalPolicy:'never'}});
 else if(m.method==='mcpServerStatus/list')send({id:m.id,result:{data:[],nextCursor:null}});
 else if(m.method==='turn/start'){send({id:m.id,result:{turn:{id:'u'}}});main().catch(e=>{console.error(e.message);process.exit(1);});}
 else if(m.method==='turn/steer'){send({id:m.id,result:{turnId:'u'}});if(++steers===5)start();}
 else if(m.method==='turn/interrupt'){send({id:m.id,result:{}});process.exit(2);}
 else if(pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error('tool RPC failed')):p.resolve(m.result);}
});
