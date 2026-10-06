// Comparison reference only: fixed SELECTs, never a V2 migration/runtime/write.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCredentials,cloudflareClient } from './cloudflare-api.mjs';
import { hash } from '../../platform/findpitches-v3/contract.mjs';

export async function captureV2Pilot({credentialsFile,outputFile}) {
  const api=cloudflareClient(readCredentials(credentialsFile));
  const databases=await api.accountRequest('/d1/database'),database=databases.find(d=>d.name==='findpitches-v2-shadow-findpitches-db');
  if(!database)throw new Error('v2_shadow_reference_not_found');
  const verified=await api.accountRequest('/d1/database/'+database.uuid);
  if(verified.name!=='findpitches-v2-shadow-findpitches-db')throw new Error('v2_reference_identity_mismatch');
  const response=await api.accountRequest('/d1/database/'+database.uuid+'/query',{method:'POST',body:{
    sql:`SELECT p.*,r.content_hash AS staged_content_hash,r.updated_at AS staged_updated_at FROM structured_feed_candidate_pilot p
      JOIN structured_feed_records r ON r.producer_id=p.producer_id WHERE p.pilot_batch=? ORDER BY p.producer_id LIMIT 101`,params:['structured_source_pilot_100_v1']}});
  const records=response[0]?.results;
  if(!response[0]?.success||records?.length!==100||records.some(r=>!r.audited_at))throw new Error('audited_100_record_pilot_required');
  const times=[...new Set(records.map(r=>r.audited_at))];if(times.length!==1)throw new Error('pilot_audit_clock_not_aligned');
  const asOf=new Date(times[0].replace(' ','T')+'Z').toISOString();
  const result={schema:'findpitches-v2-pilot-reference-v1',captured_at:new Date().toISOString(),as_of:asOf,source_database_name:database.name,
    read_only:true,query_kind:'SELECT',historical_audit:true,pilot_batch:'structured_source_pilot_100_v1',records_hash:await hash(records),records};
  fs.mkdirSync(path.dirname(outputFile),{recursive:true,mode:0o700});fs.writeFileSync(outputFile,JSON.stringify(result,null,2)+'\n',{mode:0o600,flag:'wx'});return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),get=name=>args[args.indexOf(name)+1];
  try{const result=await captureV2Pilot({credentialsFile:get('--credentials'),outputFile:get('--out')});console.log(JSON.stringify({records:result.records.length,as_of:result.as_of,read_only:result.read_only,records_hash:result.records_hash}));}
  catch(error){console.error(/^[a-z][a-z0-9_]+$/.test(error.message)?error.message:'v2_reference_capture_failed');process.exitCode=1;}
}
