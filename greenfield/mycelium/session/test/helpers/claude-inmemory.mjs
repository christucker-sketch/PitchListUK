// Test-only linker: runs the real adapter with in-memory child/socket/filesystem capabilities.
// No child process, socket, model, network or host filesystem mutation is possible through these mocks.
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import * as path from 'node:path';
import * as url from 'node:url';
import * as crypto from 'node:crypto';
import * as readline from 'node:readline';
export async function adapterHarness(onInput) {
 const child=new EventEmitter();child.stdout=new PassThrough();child.stdin=new PassThrough();child.exitCode=null;
 const output=m=>child.stdout.write(JSON.stringify(m)+'\n');
 const timers=new Set();
 const later=(fn,ms)=>{const t=setTimeout(()=>{timers.delete(t);fn();},ms);timers.add(t);return t;};
 let partial='';child.stdin.on('data',b=>{partial+=b;let i;while((i=partial.indexOf('\n'))>=0){const line=partial.slice(0,i);partial=partial.slice(i+1);if(line)onInput(JSON.parse(line),{output,later});}});
 const close=()=>{if(child.exitCode!==null)return;child.exitCode=0;child.stdout.end();child.emit('close',0);};
 child.stdin.on('finish',close);child.kill=()=>{close();return true;};
 const server=new EventEmitter();server.listen=(_sock,fn)=>{queueMicrotask(fn);return server;};server.close=()=>{};
 const context=vm.createContext({Buffer,console,setTimeout:later,clearTimeout:t=>{clearTimeout(t);timers.delete(t);},process:{env:{HOME:'/offline',MYC_RUNTIME_DIR:'/offline'},pid:1,execPath:'/fake/node'}});
 const mocks={'node:child_process':{spawn:()=>child},'node:net':{createServer:()=>server},'node:fs':{rmSync(){}},'node:path':path,'node:url':url,'node:crypto':crypto,'node:readline':readline};
 const file=new URL('../../adapters/claude-stream.mjs',import.meta.url);
 const mod=new vm.SourceTextModule(readFileSync(file,'utf8'),{context,identifier:file.href,initializeImportMeta:meta=>{meta.url=file.href;}});
 await mod.link(spec=>{const obj=mocks[spec];if(!obj)throw Error('unmocked capability '+spec);const names=Object.keys(obj);return new vm.SyntheticModule(names,function(){for(const n of names)this.setExport(n,obj[n]);},{context});});await mod.evaluate();
 return {run:mod.namespace.agentRun,child,output,later,cleanup(){for(const t of timers)clearTimeout(t);close();}};
}
