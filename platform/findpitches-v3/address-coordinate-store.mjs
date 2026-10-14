import {hash,stableJson} from './contract.mjs';
import {sql} from './store.mjs';
import {encodeSourceDocument,decodeSourceDocument} from './document-custody.mjs';
import {verifyDocument,compareProof,VERIFIER_VERSION} from './verification.mjs';
import {censusAddressInput,censusPosition,fetchCensusPosition,validAddressCoordinates} from './address-coordinates.mjs';

export async function addressKey(address){const input=censusAddressInput(address);return input?hash(['US',input.house_number,input.street_name,input.city,input.state,input.zip]):null;}
async function shadowGuard(db){const p=await sql(db,`SELECT (SELECT publication_enabled FROM runtime_policy WHERE id=1) publication,
 (SELECT bulk_enabled FROM serper_policy WHERE id=1) bulk,(SELECT manual_paused FROM commercial_acquisition_policy WHERE id=1) paused`).first();
 if(p.publication||p.bulk||p.paused!==1)throw Error('venue_map_free_shadow_required');}
export async function startVenueMap(db,{max_requests=200,max_entities=2500}={},now=new Date().toISOString()){
 await shadowGuard(db);if(!Number.isInteger(max_requests)||max_requests<1||max_requests>250||!Number.isInteger(max_entities)||max_entities<1||max_entities>3000)throw Error('bounded_venue_map_required');
 const run={id:'venue_map_'+crypto.randomUUID(),max_requests,max_entities,created_at:now,expires_at:new Date(Date.parse(now)+2*3600000).toISOString()};
 await sql(db,"INSERT INTO venue_map_runs(id,status,max_requests,max_entities,created_at,expires_at) VALUES (?,'active',?,?,?,?)",run.id,max_requests,max_entities,now,run.expires_at).run();return run;
}
export async function stopVenueMap(db,id,reason='operator_complete'){await sql(db,"UPDATE venue_map_runs SET status='paused',stop_reason=? WHERE id=? AND status='active'",reason,id).run();}
async function proofAddress(db,entityId,now){
 const row=await sql(db,`SELECT e.*,v.id verification_id,v.sequence,v.entity_revision,v.document_id,v.report_json,v.checked_at,v.expires_at,v.verifier_version,v.status,d.document_json,
 (SELECT json_group_object(field_name,json(value_json)) FROM selected_facts WHERE entity_id=e.id) fields_json
 FROM entities e JOIN source_verifications v ON v.entity_id=e.id JOIN source_documents d ON d.id=v.document_id
 WHERE e.id=? AND v.sequence=(SELECT MAX(sequence) FROM source_verifications WHERE entity_id=e.id)`,entityId).first();
 if(!row||!['shadow','test'].includes(row.environment)||row.market!=='US'||row.status!=='verified'||row.entity_revision!==row.revision||row.verifier_version!==VERIFIER_VERSION||row.checked_at>now||row.expires_at<=now)return {reason:'current_us_source_proof_required'};
 const report=verifyDocument(await decodeSourceDocument(row.document_json,{db}),{now}),original=JSON.parse(row.report_json),fields=JSON.parse(row.fields_json??'{}');
 if(report.status!=='verified'||compareProof({...row,...fields},report).length||report.facts.country!=='US'||report.facts.location!==original.facts.location)return {reason:'retained_source_address_not_bound_to_current_proof'};
 if(!censusAddressInput(report.venue_address))return {reason:'source_exact_street_city_state_missing'};
 return {row,address:report.venue_address};
}
export async function attachCachedAddress(db,{entityId,verificationId,address,now=new Date().toISOString()}){
 const key=await addressKey(address);if(!key)return {attached:false,reason:'source_exact_street_city_state_missing'};
 const cache=await sql(db,"SELECT c.*,d.document_json FROM address_coordinate_cache c JOIN source_documents d ON d.id=c.document_id WHERE c.address_hash=? AND c.status='matched' ORDER BY c.created_at DESC,c.id LIMIT 1",key).first();
 if(!cache||Date.parse(cache.created_at)<Date.parse(now)-180*86400000)return {attached:false,reason:'no_current_exact_address_cache'};
 const {position,reason}=censusPosition(address,await decodeSourceDocument(cache.document_json,{db}));if(!position)return {attached:false,reason};
 const v=await sql(db,'SELECT v.*,e.revision FROM source_verifications v JOIN entities e ON e.id=v.entity_id WHERE v.id=? AND v.entity_id=? AND v.sequence=(SELECT MAX(sequence) FROM source_verifications WHERE entity_id=e.id)',verificationId,entityId).first();
 if(!v||v.entity_revision!==v.revision||v.status!=='verified'||v.checked_at>now||v.expires_at<=now||JSON.parse(v.report_json).facts.location!==address.location)return {attached:false,reason:'source_proof_changed_during_coordinate_resolution'};
 const value={...position,entity_id:entityId,entity_revision:v.entity_revision,verification_id:v.sequence,source_document_id:v.document_id,source_checked_at:v.checked_at,source_expires_at:v.expires_at,geocode_document_id:cache.document_id};
 const id='geo_'+(await hash([entityId,verificationId,cache.id])).slice(0,40);
 const result=await sql(db,`INSERT OR IGNORE INTO venue_address_coordinates VALUES (?,?,?,?,?,?,?,?,?)`,id,entityId,v.entity_revision,verificationId,v.sequence,v.document_id,cache.id,stableJson(value),now).run();
 return {attached:true,inserted:Number(result.meta?.changes??0),position:validAddressCoordinates(value,{country:'US',location:address.location})};
}
export async function resolveVenueAddress(db,{run_id,entity_id}={}, {fetcher=fetch,clock=()=>new Date().toISOString(),now=clock()}={}){
 await shadowGuard(db);const prior=await sql(db,'SELECT * FROM venue_map_checks WHERE run_id=? AND entity_id=?',run_id,entity_id).first();
 if(prior)return prior.result_json?{...JSON.parse(prior.result_json),replay:true}:{status:'held',reason:'coordinate_request_custody_requires_review',replay:true};
 const reserve=await db.batch([
  sql(db,"UPDATE venue_map_runs SET entities_checked=entities_checked+1 WHERE id=? AND status='active' AND expires_at>? AND entities_checked<max_entities RETURNING id",run_id,now),
 ]);if(!reserve[0].results.length)throw Error('active_bounded_venue_map_required');
 await sql(db,"INSERT INTO venue_map_checks VALUES (?,?,'checking',NULL,NULL)",run_id,entity_id).run();
 const finish=async result=>{await sql(db,'UPDATE venue_map_checks SET status=?,reason=?,result_json=? WHERE run_id=? AND entity_id=?',result.status,result.reason??null,stableJson(result),run_id,entity_id).run();return result;};
 const proof=await proofAddress(db,entity_id,now);if(proof.reason)return finish({entity_id,status:'held',reason:proof.reason,provider_requests:0});
 const {row,address}=proof,key=await addressKey(address),cached=await attachCachedAddress(db,{entityId:entity_id,verificationId:row.verification_id,address,now});
 if(cached.attached)return finish({entity_id,status:'mapped',cached:true,provider_requests:0});
 const negative=await sql(db,"SELECT reason,created_at FROM address_coordinate_cache WHERE address_hash=? AND status='held' ORDER BY created_at DESC LIMIT 1",key).first();
 if(negative&&Date.parse(negative.created_at)>Date.parse(now)-86400000)return finish({entity_id,status:'held',reason:negative.reason,cached:true,provider_requests:0});
 const request=await sql(db,"UPDATE venue_map_runs SET requests_reserved=requests_reserved+1 WHERE id=? AND status='active' AND expires_at>? AND requests_reserved<max_requests RETURNING requests_reserved",run_id,now).all();
 if(!request.results.length){await stopVenueMap(db,run_id,'free_geocoder_request_limit');return finish({entity_id,status:'held',reason:'free_geocoder_request_limit',provider_requests:0});}
 const fetched=await fetchCensusPosition(address,{fetcher,now});
 if(!fetched.document)throw Error('coordinate_receipt_required');
 const documentId='doc_'+(await hash(fetched.document)).slice(0,40),cacheId='geo_cache_'+(await hash([key,documentId])).slice(0,40);
 await db.batch([
  sql(db,'INSERT OR IGNORE INTO source_documents VALUES (?,?,?,?,?)',documentId,fetched.document.url,await hash(fetched.document.json_text??''),now,await encodeSourceDocument(fetched.document,{db})),
  sql(db,'INSERT OR IGNORE INTO address_coordinate_cache VALUES (?,?,?,?,?,?,?)',cacheId,key,documentId,fetched.position?'matched':'held',fetched.reason??null,fetched.position?stableJson(fetched.position):null,now),
 ]);
 if(!fetched.position){if(/census_http_(?:403|429|5\d\d)|fetch_failed/.test(fetched.reason))await stopVenueMap(db,run_id,fetched.reason);return finish({entity_id,status:'held',reason:fetched.reason,provider_requests:1});}
 const attached=await attachCachedAddress(db,{entityId:entity_id,verificationId:row.verification_id,address,now:clock()});
 return finish({entity_id,status:attached.attached?'mapped':'held',reason:attached.attached?null:attached.reason,provider_requests:1,cached:false});
}
