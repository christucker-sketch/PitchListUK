// Local artifact preparation ONLY. No API, upload, deployment or credential access.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {PRODUCER_RECHECK_PAGE_SQL,PRODUCER_RECHECK_COUNT_SQL} from '../../platform/findpitches-v3/recheck-query.mjs';
export const LEGACY_RECHECK_PAGE_SQL = "SELECT q.entity_id,q.requested_at,q.reason,r.producer_record_id,r.market,r.environment,\n    MAX(json_extract(r.normalized_json,'$.last_checked')) AS latest_accepted_source_check\n    FROM recheck_requests q JOIN entity_records er ON er.entity_id=q.entity_id JOIN producer_records r ON r.id=er.record_id\n    WHERE ${MEMBERSHIP} AND (q.requested_at>? OR (q.requested_at=? AND (q.entity_id>? OR (q.entity_id=? AND r.producer_record_id>?))))\n    GROUP BY q.entity_id,q.requested_at,q.reason,r.producer_record_id,r.market,r.environment\n    ORDER BY q.requested_at,q.entity_id,r.producer_record_id LIMIT ?";
export const sha256=text=>createHash('sha256').update(text).digest('hex');
export const LEGACY_RECHECK_COUNT_SQL = "SELECT COUNT(*) AS n FROM recheck_requests q WHERE EXISTS(SELECT 1 FROM entity_records er JOIN producer_records r ON r.id=er.record_id WHERE er.entity_id=q.entity_id AND ${MEMBERSHIP})";

export function extractOnlyWorkerModule(raw) {
  const boundary=raw.slice(0,raw.indexOf('\r\n'));
  if(!/^--[A-Za-z0-9_-]{10,100}$/.test(boundary))throw Error('unsupported multipart boundary');
  const chunks=raw.split(boundary);
  if(chunks.length!==3||chunks[0]!==''||chunks[2].trim()!=='--')throw Error('exactly one Worker module required');
  const part=chunks[1], split=part.indexOf('\r\n\r\n');
  if(split<0||!part.endsWith('\r\n'))throw Error('invalid multipart module');
  const headers=part.slice(0,split),name=headers.match(/Content-Disposition: form-data; name="([^"\r\n]+)"/i)?.[1];
  if(!name||!/^worker\.(?:m?js)$/.test(name))throw Error('unexpected Worker module name');
  return {name,source:part.slice(split+4,-2)};
}
export function patchRecheckQuery(source,expectedSha256) {
  if(!/^[a-f0-9]{64}$/.test(expectedSha256)||sha256(source)!==expectedSha256)throw Error('active module hash mismatch');
  const sites=[[LEGACY_RECHECK_PAGE_SQL,PRODUCER_RECHECK_PAGE_SQL],[LEGACY_RECHECK_COUNT_SQL,PRODUCER_RECHECK_COUNT_SQL]];
  let patched=source,maskedBefore=source,maskedAfter;
  for(let i=0;i<sites.length;i++){
    const [oldSql,newSql]=sites[i],needle='`'+oldSql+'`',parts=patched.split(needle);
    if(parts.length!==2)throw Error('exactly one original recheck SQL site required for '+i);
    patched=parts[0]+'`'+newSql+'`'+parts[1];
    maskedBefore=maskedBefore.replace(needle,'__REVIEWED_SQL_SITE_'+i+'__');
  }
  maskedAfter=patched;
  for(let i=0;i<sites.length;i++)maskedAfter=maskedAfter.replace('`'+sites[i][1]+'`','__REVIEWED_SQL_SITE_'+i+'__');
  if(maskedBefore!==maskedAfter)throw Error('unrelated code changed');
  return {source:patched,manifest:{beforeSha256:expectedSha256,afterSha256:sha256(patched),replacementCount:2,
    sqlSites:sites.map(([oldSql,newSql])=>({beforeSqlSha256:sha256(oldSql),afterSqlSha256:sha256(newSql)})),
    unchangedRegionsSha256:sha256(maskedBefore),requiresIndex:'structured_recheck_lookup',
    migrationsApplied:0,uploaded:false,deployed:false}};
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url) {
  const [rawPath,outPrefix,expectedSha]=process.argv.slice(2);
  if(!rawPath||!outPrefix||!expectedSha)throw Error('usage: prepare-recheck-query-patch.mjs raw-multipart out-prefix expected-active-module-sha256');
  const module=extractOnlyWorkerModule(fs.readFileSync(rawPath,'utf8'));
  const result=patchRecheckQuery(module.source,expectedSha);
  fs.writeFileSync(outPrefix+'.worker.mjs',result.source,{flag:'wx',mode:0o600});
  fs.writeFileSync(outPrefix+'.manifest.json',JSON.stringify({...result.manifest,moduleName:module.name},null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify(result.manifest,null,2));
}
