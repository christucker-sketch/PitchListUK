// Standalone export delivery: only the ingest API/token, never a D1 or Cloudflare binding.
// Local patch 2026-10-07: 25-record batches, 180 s import timeout, per-batch duration_ms in checkpoints, stale-lock recovery.
// 2026-10-10 (V3-001): fetchRechecks follows next_cursor to the end; acks carry producer_record_id + entity_id +
// original requested_at. Both functions match operations/findpitches-v3/producer-delivery.mjs (V3 reference).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const digest=text=>createHash('sha256').update(text).digest('hex');
function processAlive(pid){try{process.kill(pid,0);return true;}catch(error){return error.code==='EPERM';}}
// Opens a lock exclusively; clears a lock left by a process that no longer exists (e.g. killed by reboot or task time limit).
export function openLock(file){
  try{return fs.openSync(file,'wx',0o600);}catch(error){
    if(error.code!=='EEXIST')throw error;
    let owner=null;try{owner=JSON.parse(fs.readFileSync(file,'utf8')).pid;}catch{}
    const age=Date.now()-fs.statSync(file).mtimeMs;
    if((Number.isInteger(owner)&&owner!==process.pid&&!processAlive(owner))||(!Number.isInteger(owner)&&age>10800000)){fs.unlinkSync(file);return fs.openSync(file,'wx',0o600);}
    throw error;
  }
}
export function readExport(file) {
  if(fs.statSync(file).size>134217728)throw new Error('export_file_size_limit');
  const text=fs.readFileSync(file,'utf8'),data=text.replace(/^\uFEFF/,'');let parsed;
  try {parsed=JSON.parse(data);}catch {
    parsed=data.split(/\r?\n/).filter(line=>line.trim()).map((line,index)=>{
      try{return JSON.parse(line);}catch{throw new Error('invalid_export_jsonl_line_'+(index+1));}
    });
  }
  const records=Array.isArray(parsed)?parsed:Array.isArray(parsed?.records)?parsed.records:[parsed];
  if(!records.length||records.some(r=>!r||typeof r!=='object'||Array.isArray(r)||r.schema_version!=='findpitches-discovery-export-v1'))throw new Error('structured_export_contract_required');
  return {records,file_hash:digest(text)};
}
export function importBatches(records,{maxRecords=25,maxBytes=614400}={}) {
  const batches=[];let batch=[],bytes=40;
  for(const record of records) {
    const size=Buffer.byteLength(JSON.stringify(record),'utf8');
    if(size>131072)throw new Error('export_record_size_limit');
    if(batch.length&&(batch.length>=maxRecords||bytes+size+1>maxBytes)){batches.push(batch);batch=[];bytes=40;}
    batch.push(record);bytes+=size+1;
  }
  if(batch.length)batches.push(batch);return batches;
}
export function readIngestToken(file) {
  const source=fs.readFileSync(file,'utf8');let token;
  try{token=JSON.parse(source).V3_INGEST_TOKEN;}catch{
    const match=source.match(/^\s*V3_INGEST_TOKEN\s*=\s*(.*?)\s*$/m);token=match?.[1]?.replace(/^['"]|['"]$/g,'');
  }
  if(typeof token!=='string'||token.length<24||/\s/.test(token))throw new Error('ingest_token_file_required');return token;
}
function endpoint(value) {
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('https_ingest_origin_required');
  return url.origin;
}
function writeState(file,state) {
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const temporary=file+'.'+crypto.randomUUID()+'.tmp';
  fs.writeFileSync(temporary,JSON.stringify(state,null,2)+'\n',{mode:0o600});fs.renameSync(temporary,file);
}
export async function deliverExport({inputFile,ingestUrl,token,checkpointFile,environment='shadow',fetcher=fetch}) {
  if(!['shadow','test'].includes(environment))throw new Error('shadow_or_test_required');
  if(typeof token!=='string'||token.length<24)throw new Error('ingest_token_required');
  const origin=endpoint(ingestUrl),input=readExport(inputFile),batches=importBatches(input.records),deliveryId=digest(origin+'\n'+environment+'\n'+input.file_hash);
  const previous=fs.existsSync(checkpointFile)?JSON.parse(fs.readFileSync(checkpointFile,'utf8')):null;
  if(previous&&(previous.ingest_origin!==origin||previous.environment!==environment))throw new Error('checkpoint_destination_mismatch');
  const state=previous?.delivery_id===deliveryId?previous:{schema:'findpitches-export-delivery-v1',delivery_id:deliveryId,ingest_origin:origin,environment,file_hash:input.file_hash,total_records:input.records.length,total_batches:batches.length,next_batch:0,accepted:0,rejected:0,inserted:0,duplicates:0,results:[]};
  if(state.total_batches!==batches.length||state.next_batch<0||state.next_batch>batches.length)throw new Error('delivery_checkpoint_invalid');
  fs.mkdirSync(path.dirname(checkpointFile),{recursive:true,mode:0o700});
  const lock=checkpointFile+'.lock';let fd;
  try{fd=openLock(lock);}catch{throw new Error('delivery_already_running_or_stale_lock');}
  fs.writeSync(fd,JSON.stringify({pid:process.pid,started_at:new Date().toISOString()}));
  try {
    for(let index=state.next_batch;index<batches.length;index++) {
      const started=Date.now();
      const response=await fetcher(origin+'/imports',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({environment,records:batches[index]}),signal:AbortSignal.timeout(180000)});
      if(!response.ok)throw new Error('ingest_http_'+response.status);
      const result=await response.json();
      if(result.accepted+result.rejected!==batches[index].length||result.inserted+result.duplicates!==batches[index].length||!Array.isArray(result.record_ids)||!Array.isArray(result.errors))throw new Error('ingest_receipt_invalid');
      for(const field of ['accepted','rejected','inserted','duplicates'])state[field]+=result[field];
      const lastChecked={};
      for(const record of batches[index]) {
        const id=record.opportunity_id??record.producer_record_id,time=Date.parse(record.last_checked);
        if(Number.isFinite(time)&&(!lastChecked[id]||time>Date.parse(lastChecked[id])))lastChecked[id]=record.last_checked;
      }
      state.results.push({batch:index,duration_ms:Date.now()-started,producer_record_ids:batches[index].map(r=>r.opportunity_id??r.producer_record_id),last_checked_by_producer:lastChecked,...result});
      state.next_batch=index+1;state.updated_at=new Date().toISOString();writeState(checkpointFile,state);
    }
    state.complete=true;writeState(checkpointFile,state);return state;
  } finally {fs.closeSync(fd);fs.unlinkSync(lock);}
}
export async function fetchRechecks({ingestUrl,token,fetcher=fetch,probe=false}) {
  const requests=[],seen=new Set();let cursor='';
  for(let page=0;page<100;page++) {
    const query=new URLSearchParams();if(probe)query.set('probe','1');if(cursor)query.set('cursor',cursor);
    const response=await fetcher(endpoint(ingestUrl)+'/rechecks'+(query.size?'?'+query:''),{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error('recheck_http_'+response.status);
    const body=await response.json();if(!Array.isArray(body.requests)||body.requests.length>100)throw new Error('recheck_receipt_invalid');requests.push(...body.requests);
    if(!body.next_cursor)return requests;
    if(typeof body.next_cursor!=='string'||body.next_cursor.length>3000||seen.has(body.next_cursor))throw new Error('recheck_cursor_loop');
    seen.add(body.next_cursor);cursor=body.next_cursor;
  }
  throw new Error('recheck_pagination_limit');
}
export async function acknowledgeDeliveredRechecks({requests,delivery,token,fetcher=fetch}) {
  const accepted=new Map();let acknowledged=0;
  for(const result of delivery.results.filter(r=>r.rejected===0))for(const id of result.producer_record_ids) {
    const time=Date.parse(result.last_checked_by_producer?.[id]);
    if(Number.isFinite(time))accepted.set(id,Math.max(time,accepted.get(id)??0));
  }
  for(const request of requests) {
    if(request.environment!==delivery.environment||!accepted.has(request.producer_record_id)||!(accepted.get(request.producer_record_id)>=Date.parse(request.requested_at)))continue;
    const response=await fetcher(endpoint(delivery.ingest_origin)+'/rechecks/ack',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({entity_id:request.entity_id,requested_at:request.requested_at,producer_record_id:request.producer_record_id}),signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error('recheck_ack_http_'+response.status);
    if((await response.json()).acknowledged)acknowledged++;
  }
  return {acknowledged};
}
// V3-002 option B (PREPARED, OFF unless the runner config names a manifest): upload the exact source documents the
// discovery side published under export/v3/docs/ for hosts V3 cannot fetch. One document per request; each is
// re-hashed before sending and recorded as sent only when V3 echoes the same sha256. V3 runs its own verifier.
// Endpoint and response shape are a proposal (docs/findpitches-v3-producer-source-documents-proposal.md).
export async function uploadSourceDocuments({manifestFile,ingestUrl,token,stateFile,environment='shadow',fetcher=fetch,maxPerCycle=200}) {
  if(!['shadow','test'].includes(environment))throw new Error('shadow_or_test_required');
  const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
  if(manifest.schema!=='findpitches-source-documents-manifest-v1'||!Array.isArray(manifest.documents))throw new Error('source_documents_manifest_invalid');
  const state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,'utf8')):{sent:{}};
  const base=path.dirname(manifestFile);let sent=0,skipped=0;
  for(const doc of manifest.documents) {
    if(state.sent[doc.content_sha256])continue;
    if(sent>=maxPerCycle)break;
    const file=path.resolve(base,doc.file);
    if(!file.startsWith(path.resolve(base)+path.sep)||!fs.existsSync(file)){skipped++;continue;}
    const body=fs.readFileSync(file);
    if(digest(body)!==doc.content_sha256||body.length>2000000){skipped++;continue;}
    const {file:_f,...meta}=doc;
    const response=await fetcher(endpoint(ingestUrl)+'/source-documents',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({environment,document:{...meta,body_base64:body.toString('base64')}}),signal:AbortSignal.timeout(60000)});
    if(!response.ok)throw new Error('source_document_http_'+response.status);
    const result=await response.json();
    if(result.content_sha256!==doc.content_sha256||typeof result.accepted!=='boolean')throw new Error('source_document_receipt_invalid');
    if(result.accepted){state.sent[doc.content_sha256]=new Date().toISOString();sent++;}else skipped++;
    writeState(stateFile,state);
  }
  return {sent,skipped,pending:manifest.documents.filter(d=>!state.sent[d.content_sha256]).length};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),get=name=>args.includes(name)?args[args.indexOf(name)+1]:null;
  try {
    const token=readIngestToken(get('--token-file')),ingestUrl=get('--ingest-url');
    // Node fetch can use the environment proxy through this optional external tool adapter.
    let fetcher=fetch;
    if(process.env.V3_TOOLING_ROOT) {
      const require=createRequire(path.join(process.env.V3_TOOLING_ROOT,'package.json')),{fetch:proxyRequest,EnvHttpProxyAgent}=require('undici'),dispatcher=new EnvHttpProxyAgent();
      fetcher=(url,options={})=>proxyRequest(url,{...options,dispatcher});
    }
    if(get('--rechecks-out')){writeState(get('--rechecks-out'),{requests:await fetchRechecks({ingestUrl,token,fetcher})});}
    if(get('--input')) {
      if(!get('--checkpoint'))throw new Error('delivery_checkpoint_required');
      const result=await deliverExport({inputFile:get('--input'),ingestUrl,token,checkpointFile:get('--checkpoint'),environment:get('--environment')??'shadow',fetcher});
      if(get('--ack-rechecks'))await acknowledgeDeliveredRechecks({requests:JSON.parse(fs.readFileSync(get('--ack-rechecks'),'utf8')).requests,delivery:result,token,fetcher});
      console.log(JSON.stringify({complete:result.complete,total_records:result.total_records,accepted:result.accepted,rejected:result.rejected,inserted:result.inserted,duplicates:result.duplicates,file_hash:result.file_hash}));
      if(result.rejected)process.exitCode=1;
    }
    if(!get('--input')&&!get('--rechecks-out'))throw new Error('export_input_or_recheck_output_required');
  }catch(error){console.error(/^[a-z][a-z0-9_]+$/.test(error.message)?error.message:'export_delivery_failed');process.exitCode=1;}
}
