// Run beside the independent producer. Only delivery APIs and producer export data.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { readExport,readIngestToken,deliverExport,fetchRechecks,acknowledgeDeliveredRechecks } from './producer-delivery.mjs';

function write(file,value) {
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const temporary=file+'.'+crypto.randomUUID()+'.tmp';
  fs.writeFileSync(temporary,JSON.stringify(value,null,2)+'\n',{mode:0o600});fs.renameSync(temporary,file);
}
export function runnerConfig(file) {
  const config=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'')),base=path.dirname(path.resolve(file));
  if(['input_file','input_directory','export_url'].filter(key=>config[key]).length!==1)throw new Error('exactly_one_export_source_required');
  for(const key of ['input_file','input_directory','token_file','state_dir','export_token_file'])if(config[key])config[key]=path.resolve(base,config[key]);
  if(!config.token_file||!config.state_dir||!config.ingest_url)throw new Error('delivery_paths_required');
  config.environment??='shadow';config.interval_seconds??=900;
  if(!['shadow','test'].includes(config.environment)||!Number.isInteger(config.interval_seconds)||config.interval_seconds<60||config.interval_seconds>86400)throw new Error('bounded_delivery_cadence_required');
  if(config.export_url) {
    const url=new URL(config.export_url);
    if(url.protocol!=='https:'||url.username||url.password)throw new Error('https_export_url_required');
  }
  if(config.file_pattern&&!/^[a-zA-Z0-9_.\-*]+$/.test(config.file_pattern))throw new Error('export_file_pattern_invalid');
  return config;
}
async function materializeExport(config,fetcher) {
  let source;
  if(config.input_directory) {
    const pattern=config.file_pattern??'*.json*',matches=new RegExp('^'+pattern.split('*').map(part=>part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*')+'$','i');
    const files=fs.readdirSync(config.input_directory,{withFileTypes:true}).filter(e=>e.isFile()&&/\.jsonl?$/i.test(e.name)&&matches.test(e.name)).map(e=>path.join(config.input_directory,e.name)).sort();
    if(!files.length)throw new Error('no_matching_producer_exports');
    const records=files.flatMap(file=>readExport(file).records);source=Buffer.from(JSON.stringify(records));
    if(source.length>134217728)throw new Error('export_file_size_limit');
  } else if(config.input_file) {
    if(fs.statSync(config.input_file).size>134217728)throw new Error('export_file_size_limit');
    source=fs.readFileSync(config.input_file);
  } else {
    const headers={};
    if(config.export_token_file) {
      const value=fs.readFileSync(config.export_token_file,'utf8').trim();
      if(!value||/[\r\n]/.test(value))throw new Error('export_bearer_file_invalid');headers.Authorization='Bearer '+value;
    }
    const response=await fetcher(config.export_url,{headers,redirect:'error',signal:AbortSignal.timeout(60000)});
    if(!response.ok)throw new Error('export_http_'+response.status);
    if(Number(response.headers.get('content-length'))>134217728)throw new Error('export_file_size_limit');
    const parts=[];let size=0;
    for await(const part of response.body) {size+=part.length;if(size>134217728)throw new Error('export_file_size_limit');parts.push(Buffer.from(part));}
    source=Buffer.concat(parts);
  }
  const hash=createHash('sha256').update(source).digest('hex'),file=path.join(config.state_dir,'exports',hash+'.json');
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  if(!fs.existsSync(file))fs.writeFileSync(file,source,{mode:0o600,flag:'wx'});
  return {file,...readExport(file)};
}
export async function deliveryCycle(config,{fetcher=fetch,now=()=>new Date()}={}) {
  fs.mkdirSync(config.state_dir,{recursive:true,mode:0o700});
  const lock=path.join(config.state_dir,'cycle.lock');let fd;
  try{fd=fs.openSync(lock,'wx',0o600);}catch(error){if(error.code==='EEXIST')return {status:'busy'};throw error;}
  fs.writeSync(fd,JSON.stringify({pid:process.pid,started_at:now().toISOString()}));
  const statusFile=path.join(config.state_dir,'status.json');
  let previous={};
  try {
    previous=fs.existsSync(statusFile)?JSON.parse(fs.readFileSync(statusFile,'utf8')):{};
    const token=readIngestToken(config.token_file),requests=await fetchRechecks({ingestUrl:config.ingest_url,token,fetcher});
    write(path.join(config.state_dir,'rechecks.json'),{requested_at:now().toISOString(),requests});
    const input=await materializeExport(config,fetcher);
    const delivery=await deliverExport({inputFile:input.file,ingestUrl:config.ingest_url,token,checkpointFile:path.join(config.state_dir,'checkpoints',input.file_hash+'.json'),environment:config.environment,fetcher});
    const ack=await acknowledgeDeliveredRechecks({requests,delivery,token,fetcher});
    const latest=input.records.reduce((value,r)=>{const time=Date.parse(r.last_checked);return Number.isFinite(time)?Math.max(value??time,time):value;},null);
    const sourceAge=latest===null?null:Math.max(0,Math.round((now().getTime()-latest)/1000));
    const status={schema:'findpitches-producer-runner-v1',status:delivery.rejected?'rejected':'delivered',environment:config.environment,
      checked_at:now().toISOString(),last_success_at:delivery.rejected?previous.last_success_at??null:now().toISOString(),
      file_hash:input.file_hash,unchanged_export:previous.file_hash===input.file_hash,last_changed_at:previous.file_hash===input.file_hash?previous.last_changed_at:now().toISOString(),
      records:delivery.total_records,accepted:delivery.accepted,rejected:delivery.rejected,inserted:delivery.inserted,duplicates:delivery.duplicates,
      pending_rechecks:requests.length,acknowledged_rechecks:ack.acknowledged,source_age_seconds:sourceAge,
      freshness_warning:sourceAge===null||sourceAge>Math.max(3600,config.interval_seconds*2),consecutive_failures:delivery.rejected?(previous.consecutive_failures??0)+1:0};
    write(statusFile,status);return status;
  } catch(error) {
    const label=/^[a-z][a-z0-9_]+$/.test(error.message)?error.message:'producer_delivery_cycle_failed';
    const status={...previous,schema:'findpitches-producer-runner-v1',status:'failed',checked_at:now().toISOString(),error:label,consecutive_failures:(previous.consecutive_failures??0)+1};
    write(statusFile,status);return status;
  } finally {fs.closeSync(fd);fs.unlinkSync(lock);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),get=name=>args.includes(name)?args[args.indexOf(name)+1]:null;
  try {
    const config=runnerConfig(get('--config'));let fetcher=fetch;
    if(process.env.V3_TOOLING_ROOT) {
      const require=createRequire(path.join(process.env.V3_TOOLING_ROOT,'package.json')),{fetch:request,EnvHttpProxyAgent}=require('undici'),dispatcher=new EnvHttpProxyAgent();
      fetcher=(url,options={})=>request(url,{...options,dispatcher});
    }
    do {
      const result=await deliveryCycle(config,{fetcher});console.log(JSON.stringify(result));
      if(!args.includes('--loop')){if(['failed','rejected'].includes(result.status))process.exitCode=1;break;}
      const backoff=result.consecutive_failures?Math.max(config.interval_seconds,Math.min(3600,config.interval_seconds*2**Math.min(6,result.consecutive_failures-1))):config.interval_seconds;
      await delay(backoff*1000);
    }while(true);
  }catch(error){console.error(/^[a-z][a-z0-9_]+$/.test(error.message)?error.message:'producer_runner_failed');process.exitCode=1;}
}
