// Offline process stand-in. One turn reports the first proof's actual Codex usage, then completes. No model or tools.
import {createInterface} from 'node:readline';
const send=m=>process.stdout.write(JSON.stringify(m)+'\n');
const usage={totalTokens:230937,inputTokens:228500,cachedInputTokens:195456,outputTokens:2437};
createInterface({input:process.stdin}).on('line',line=>{
 const m=JSON.parse(line),p=m.params;
 if(m.method==='initialize')send({id:m.id,result:{}});
 if(m.method==='thread/start')send({id:m.id,result:{thread:{id:'t'},activePermissionProfile:{id:p.permissions},approvalPolicy:'never',cwd:p.cwd}});
 if(m.method==='mcpServerStatus/list')send({id:m.id,result:{data:[],nextCursor:null}});
 if(m.method==='turn/start'){
  send({method:'turn/started',params:{threadId:'t',turn:{id:'u'}}});send({id:m.id,result:{turn:{id:'u'}}});
  setTimeout(()=>send({method:'thread/tokenUsage/updated',params:{threadId:'t',turnId:'u',tokenUsage:{total:usage}}}),50);
  setTimeout(()=>send({method:'turn/completed',params:{threadId:'t',turn:{id:'u',status:'completed'}}}),150);
 }
 if(m.method==='turn/interrupt')send({id:m.id,result:{}});
});
