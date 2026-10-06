// Offline recovery input only. This module exposes fixed SELECTs, never V2 writes.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {cloudflareClient,readCredentials} from './cloudflare-api.mjs';
import {hash} from '../../platform/findpitches-v3/contract.mjs';

export async function captureLegacyV2({credentialsFile,outputFile,progress=()=>{}}) {
  const api=cloudflareClient(readCredentials(credentialsFile));
  const databases=await api.accountRequest('/d1/database?per_page=100');
  const database=databases.find(d=>d.name==='findpitches-v2-shadow-findpitches-db');
  if(!database||(await api.accountRequest('/d1/database/'+database.uuid)).name!==database.name)throw Error('v2_read_only_reference_required');
  async function read(query,params=[]) {
    if(!/^SELECT\b/.test(query)||/;/.test(query))throw Error('select_only_reference_required');
    const response=await api.accountRequest('/d1/database/'+database.uuid+'/query',{method:'POST',body:{sql:query,params}});
    if(!response[0]?.success)throw Error('v2_reference_read_failed');
    return response[0].results;
  }
  const started=new Date().toISOString(),tables={};
  for(const [table,key] of [['candidates','id'],['customer_opportunities','id'],['candidate_enrichment','candidate_id'],['structured_feed_records','producer_id'],['structured_feed_candidate_pilot','producer_id']]) {
    // Pin the identity set before paging; V2's independent jobs may continue updating fields.
    const ids=(await read(`SELECT ${key} AS id FROM ${table} ORDER BY ${key}`)).map(r=>r.id);
    const rows=[];
    for(let offset=0;offset<ids.length;offset+=100) {
      const chunk=ids.slice(offset,offset+100);
      rows.push(...await read(`SELECT * FROM ${table} WHERE ${key} IN (${chunk.map(()=>'?').join(',')}) ORDER BY ${key}`,chunk));
      if(offset%2000===0)progress({table,captured:rows.length,expected:ids.length});
    }
    if(rows.length!==ids.length)throw Error('v2_reference_identity_set_changed');
    tables[table]=rows;
  }
  const result={schema:'findpitches-legacy-v2-evidence-snapshot-v1',source_database_name:database.name,read_only:true,
    query_kind:'SELECT',capture_started_at:started,capture_completed_at:new Date().toISOString(),
    consistency:'Pinned identity sets; field values read during capture, not a transactional V2 snapshot.',
    counts:Object.fromEntries(Object.entries(tables).map(([k,v])=>[k,v.length])),tables,content_hash:await hash(tables)};
  fs.mkdirSync(path.dirname(outputFile),{recursive:true,mode:0o700});
  fs.writeFileSync(outputFile,JSON.stringify(result)+'\n',{mode:0o600,flag:'wx'});
  return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),get=name=>args[args.indexOf(name)+1];
  try {const result=await captureLegacyV2({credentialsFile:get('--credentials'),outputFile:get('--out'),progress:r=>console.log(JSON.stringify(r))});console.log(JSON.stringify({counts:result.counts,content_hash:result.content_hash,read_only:true}));}
  catch {console.error('legacy_v2_read_only_capture_failed');process.exitCode=1;}
}
