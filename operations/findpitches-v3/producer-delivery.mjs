// Standalone export delivery: only the ingest API/token, never a D1 or Cloudflare binding.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const digest=text=>createHash('sha256').update(text).digest('hex');
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
export function importBatches(records,{maxRecords=100,maxBytes=614400}={}) {
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
  try{fd=fs.openSync(lock,'wx',0o600);}catch{throw new Error('delivery_already_running_or_stale_lock');}
  fs.writeSync(fd,JSON.stringify({pid:process.pid,started_at:new Date().toISOString()}));
  try {
    for(let index=state.next_batch;index<batches.length;index++) {
      const response=await fetcher(origin+'/imports',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({environment,records:batches[index]}),signal:AbortSignal.timeout(60000)});
      if(!response.ok)throw new Error('ingest_http_'+response.status);
      const result=await response.json();
      if(result.accepted+result.rejected!==batches[index].length||result.inserted+result.duplicates!==batches[index].length||!Array.isArray(result.record_ids)||!Array.isArray(result.errors))throw new Error('ingest_receipt_invalid');
      for(const field of ['accepted','rejected','inserted','duplicates'])state[field]+=result[field];
      const lastChecked={};
      for(const record of batches[index]) {
        const id=record.opportunity_id??record.producer_record_id,time=Date.parse(record.last_checked);
        if(Number.isFinite(time)&&(!lastChecked[id]||time>Date.parse(lastChecked[id])))lastChecked[id]=record.last_checked;
      }
      state.results.push({batch:index,producer_record_ids:batches[index].map(r=>r.opportunity_id??r.producer_record_id),last_checked_by_producer:lastChecked,...result});
      state.next_batch=index+1;state.updated_at=new Date().toISOString();writeState(checkpointFile,state);
    }
    state.complete=true;writeState(checkpointFile,state);return state;
  } finally {fs.closeSync(fd);fs.unlinkSync(lock);}
}
export async function fetchRechecks({ingestUrl,token,fetcher=fetch,probe=false}) {
  const response=await fetcher(endpoint(ingestUrl)+'/rechecks'+(probe?'?probe=1':''),{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error('recheck_http_'+response.status);
  const body=await response.json();if(!Array.isArray(body.requests))throw new Error('recheck_receipt_invalid');return body.requests;
}
export async function acknowledgeDeliveredRechecks({requests,delivery,token,fetcher=fetch}) {
  const accepted=new Map();let acknowledged=0;
  for(const result of delivery.results.filter(r=>r.rejected===0))for(const id of result.producer_record_ids) {
    const time=Date.parse(result.last_checked_by_producer?.[id]);
    if(Number.isFinite(time))accepted.set(id,Math.max(time,accepted.get(id)??0));
  }
  for(const request of requests) {
    if(request.environment!==delivery.environment||!accepted.has(request.producer_record_id)||!(accepted.get(request.producer_record_id)>=Date.parse(request.requested_at)))continue;
    const response=await fetcher(endpoint(delivery.ingest_origin)+'/rechecks/ack',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({entity_id:request.entity_id,requested_at:request.requested_at}),signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error('recheck_ack_http_'+response.status);
    if((await response.json()).acknowledged)acknowledged++;
  }
  return {acknowledged};
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
