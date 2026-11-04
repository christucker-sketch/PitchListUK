// Target-side metadata only: no turn/start, turn/steer, model request, login, config write or credential export.
// As existing myc account: node codex-boundary-preflight.mjs <new absolute evidence folder>
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdirSync,writeFileSync} from 'node:fs';
import {isAbsolute,join,resolve} from 'node:path';
import {userInfo} from 'node:os';
import {CodexRpc} from './adapters/codex-rpc.mjs';
import {prepareCodexThread} from './adapters/codex-app-server.mjs';
const out=process.argv[2],guard='/home/myc/bin/myc-run';
if(process.argv.length!==3||!out||!isAbsolute(out)||resolve(out)!==out||userInfo().username!=='myc')throw Error('existing myc account and new absolute output folder required');
mkdirSync(out,{mode:0o700});
const rec={at:new Date().toISOString(),schema:'myc-codex-boundary-metadata-v1',pass:false,modelDispatches:0,physicalSandboxDenialProven:false};
let child,timer;
try {
 const version=(await promisify(execFile)(guard,['codex','--version'],{timeout:10000,maxBuffer:16000})).stdout.trim();
 if(version!=='codex-cli 0.164.0')throw Error('target CLI version mismatch; no installation or fallback');
 rec.cli=version;
 const worktree=join(out,'fixture');mkdirSync(worktree);writeFileSync(join(worktree,'README'),'Synthetic fixture. No secrets.\n');
 child=spawn(guard,['codex','app-server','--listen','stdio://'],{cwd:worktree,detached:true,stdio:['pipe','pipe','ignore']});
 const rpc=new CodexRpc({readable:child.stdout,writable:child.stdin,timeoutMs:10000});
 const allowed=new Set(['initialize','thread/start','mcpServerStatus/list']),request=rpc.request.bind(rpc);
 rpc.request=(method,params)=>{if(!allowed.has(method))throw Error('metadata-only method refused');return request(method,params);};
 const failure=new Promise((_,reject)=>{rpc.onFailure=reject;child.once('error',reject);child.once('exit',()=>reject(Error('metadata app-server exited')));timer=setTimeout(()=>reject(Error('metadata preflight deadline')),30000);});
 await Promise.race([prepareCodexThread({rpc,worktree}),failure]);
 rec.pass=true;rec.profileConfirmed=true;rec.externalMcpServers=0;
} catch(e) {rec.error=String(e.message).slice(0,300);process.exitCode=1;}
finally {
 clearTimeout(timer);
 if(child?.pid){try{process.kill(-child.pid,'SIGTERM');}catch{} await new Promise(r=>setTimeout(r,1000));try{process.kill(-child.pid,'SIGKILL');}catch{}}
 rec.finishedAt=new Date().toISOString();writeFileSync(join(out,'boundary.json'),JSON.stringify(rec,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(rec,null,2));
}
