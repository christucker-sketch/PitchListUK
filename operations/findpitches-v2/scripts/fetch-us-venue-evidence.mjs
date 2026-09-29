#!/usr/bin/env node
// Re-fetches only the evidence URLs already attached to a private D1 snapshot.
// Bounded concurrency, timeout and response size; no discovery or D1 writes.
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync=promisify(execFile);
const [inputPath,outputPath]=process.argv.slice(2);
if(!inputPath||!outputPath)throw new Error('Usage: fetch-us-venue-evidence.mjs <private-audit.json> <private-output.json>');
const audit=JSON.parse(await readFile(resolve(inputPath),'utf8'));
const rows=audit?.inventory?.visible;
if(!Array.isArray(rows))throw new Error('findpitches_us_evidence_inventory_missing');
const queue=rows.map(row=>({row,url:String(row.location_evidence_url||'').trim()}));
const results=new Array(queue.length);
let next=0;
await Promise.all(Array.from({length:6},async()=>{
  for(;;){const index=next++;if(index>=queue.length)return;results[index]=await inspect(queue[index]);}
}));
const summary=results.reduce((out,row)=>{out[row.status]=(out[row.status]||0)+1;return out;},{});
await writeFile(resolve(outputPath),JSON.stringify({snapshot_at:audit.snapshot_at,fetched_at:new Date().toISOString(),summary,results},null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({output:resolve(outputPath),records:results.length,summary}));

async function inspect({row,url}){
  const base={opportunity_id:String(row.id),discovery_region_code:String(row.region_code||''),url,
    stored_location:String(row.location||''),stored_excerpt:locationExcerpt(row)};
  if(!url)return {...base,status:'missing_url'};
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12_000);
  try{
    const response=await fetch(url,{redirect:'follow',signal:controller.signal,headers:{
      accept:'text/html,application/xhtml+xml;q=0.9,application/pdf;q=0.8,text/plain;q=0.7,*/*;q=0.1',
      'user-agent':'FindPitchesCoverageAudit/1.0 (+https://findpitches.com)'}});
    if(!response.ok)return {...base,status:'http_error',http_status:response.status};
    const length=Number(response.headers.get('content-length')||0);
    if(length>1_500_000)return {...base,status:'too_large',content_length:length};
    const bytes=new Uint8Array(await response.arrayBuffer());
    if(bytes.length>1_500_000)return {...base,status:'too_large',content_length:bytes.length};
    const type=String(response.headers.get('content-type')||'').toLowerCase();
    let text;
    if(type.includes('pdf')||new TextDecoder().decode(bytes.subarray(0,5))==='%PDF-')text=await pdfText(bytes);
    else text=plain(new TextDecoder().decode(bytes));
    const location=plain(base.stored_location),excerpt=plain(base.stored_excerpt);
    return {...base,status:'fetched',content_type:type.slice(0,100),final_url:response.url,
      location_present:Boolean(location&&text.toLowerCase().includes(location.toLowerCase())),
      excerpt_present:Boolean(excerpt&&text.toLowerCase().includes(excerpt.toLowerCase())),
      evidence_context:context(text,location||excerpt)};
  }catch(error){return {...base,status:error?.name==='AbortError'?'timeout':'fetch_error',error:String(error?.message||error).slice(0,160)};}
  finally{clearTimeout(timer);}
}
function locationExcerpt(row){try{return JSON.parse(row.enrichment_json||'{}')?.location?.evidence?.[0]?.excerpt||'';}catch{return '';}}
function plain(value){return String(value||'').replace(/<script\b[\s\S]*?<\/script>/gi,' ').replace(/<style\b[\s\S]*?<\/style>/gi,' ')
  .replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&#39;|&apos;/gi,"'")
  .replace(/&quot;/gi,'"').replace(/\s+/g,' ').trim();}
function context(text,needle){if(!needle)return null;const at=text.toLowerCase().indexOf(needle.toLowerCase());return at<0?null:text.slice(Math.max(0,at-180),at+needle.length+260).slice(0,600);}
async function pdfText(bytes){const dir=await mkdtemp(join(tmpdir(),'fp-us-evidence-'));const pdf=join(dir,'evidence.pdf'),txt=join(dir,'evidence.txt');
  try{await writeFile(pdf,bytes,{mode:0o600});await execFileAsync('pdftotext',['-layout',pdf,txt],{timeout:10_000,maxBuffer:1024*1024});return plain(await readFile(txt,'utf8'));}
  finally{await rm(dir,{recursive:true,force:true});}}
