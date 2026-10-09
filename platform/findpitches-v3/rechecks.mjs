import {sql} from './store.mjs';
import {hash} from './contract.mjs';
const MEMBERSHIP="r.producer_name='independent-structured' AND r.environment='shadow' AND r.validation_status='accepted'";
function cursorValue(tuple) {return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(tuple))));}
function decodeCursor(cursor) {
  if(typeof cursor!=='string'||cursor.length>3000)throw Error('recheck_cursor_invalid');
  if(!cursor)return ['','',''];
  try {
    const value=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(cursor),c=>c.charCodeAt(0))));
    if(!Array.isArray(value)||value.length!==3||value.some(v=>typeof v!=='string'||v.length>500)||!Number.isFinite(Date.parse(value[0])))throw Error();
    return value;
  }catch{throw Error('recheck_cursor_invalid');}
}
export async function producerRechecks(db,{cursor='',limit=100,now=new Date().toISOString()}={}) {
  if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('recheck_page_limit_invalid');
  const [at,id,pid]=decodeCursor(cursor);
  const rows=(await sql(db,`SELECT q.entity_id,q.requested_at,q.reason,r.producer_record_id,r.market,r.environment,
    MAX(json_extract(r.normalized_json,'$.last_checked')) AS latest_accepted_source_check
    FROM recheck_requests q JOIN entity_records er ON er.entity_id=q.entity_id JOIN producer_records r ON r.id=er.record_id
    WHERE ${MEMBERSHIP} AND (q.requested_at>? OR (q.requested_at=? AND (q.entity_id>? OR (q.entity_id=? AND r.producer_record_id>?))))
    GROUP BY q.entity_id,q.requested_at,q.reason,r.producer_record_id,r.market,r.environment
    ORDER BY q.requested_at,q.entity_id,r.producer_record_id LIMIT ?`,at,at,id,id,pid,limit+1).all()).results;
  const page=rows.slice(0,limit),last=page.at(-1);
  const count=await sql(db,`SELECT COUNT(*) AS n FROM recheck_requests q WHERE EXISTS(SELECT 1 FROM entity_records er JOIN producer_records r ON r.id=er.record_id WHERE er.entity_id=q.entity_id AND ${MEMBERSHIP})`).first();
  return {schema:'findpitches-v3-producer-rechecks-v2',requests:page,pending_entities:count.n,
    next_cursor:rows.length>limit?cursorValue([last.requested_at,last.entity_id,last.producer_record_id]):null,
    as_of:now,acknowledgement_requires:'Exact request timestamp and accepted linked evidence for the named producer ID checked after the request; no future checks.'};
}
export async function acknowledgeProducerRecheck(db,{entity_id,requested_at,producer_record_id=null},{now=new Date().toISOString()}={}) {
  if(typeof entity_id!=='string'||entity_id.length>100||!entity_id||typeof requested_at!=='string'||!Number.isFinite(Date.parse(requested_at))||producer_record_id!==null&&(typeof producer_record_id!=='string'||!producer_record_id||producer_record_id.length>500))throw Error('recheck_ack_invalid');
  // Old runners omitted producer ID. Keep that contract only for unambiguous membership.
  if(producer_record_id===null) {
    const member=await sql(db,`SELECT COUNT(DISTINCT r.producer_record_id) AS n FROM entity_records er JOIN producer_records r ON r.id=er.record_id WHERE er.entity_id=? AND ${MEMBERSHIP}`,entity_id).first();
    if(member.n>1)return {acknowledged:false,reason:'producer_record_id_required'};
  }
  const ackId='recheckack_'+(await hash([entity_id,requested_at])).slice(0,32);
  const result=await db.batch([
    sql(db,`INSERT OR IGNORE INTO producer_recheck_acknowledgements(id,entity_id,requested_at,request_reason,producer_record_id,accepted_record_id,source_last_checked,acknowledged_at)
      SELECT ?,q.entity_id,q.requested_at,q.reason,r.producer_record_id,r.id,json_extract(r.normalized_json,'$.last_checked'),?
      FROM recheck_requests q JOIN entity_records er ON er.entity_id=q.entity_id JOIN producer_records r ON r.id=er.record_id
      WHERE q.entity_id=? AND q.requested_at=? AND ${MEMBERSHIP} AND (? IS NULL OR r.producer_record_id=?)
        AND julianday(json_extract(r.normalized_json,'$.last_checked'))>=julianday(q.requested_at)
        AND julianday(json_extract(r.normalized_json,'$.last_checked'))<=julianday(?)
      ORDER BY julianday(json_extract(r.normalized_json,'$.last_checked')) DESC,r.received_at DESC,r.id LIMIT 1`,ackId,now,entity_id,requested_at,producer_record_id,producer_record_id,now),
    sql(db,`DELETE FROM recheck_requests WHERE entity_id=? AND requested_at=? AND EXISTS(
      SELECT 1 FROM producer_recheck_acknowledgements a WHERE a.id=? AND a.entity_id=recheck_requests.entity_id AND a.requested_at=recheck_requests.requested_at)`,entity_id,requested_at,ackId)
  ]);
  return {acknowledged:Number(result[1].meta?.changes)===1,...(Number(result[1].meta?.changes)===1?{acknowledgement_id:ackId}:{reason:'fresh_linked_evidence_or_exact_request_missing'})};
}
export async function producerRecheckStatus(db,now=new Date().toISOString()) {
  const rows=(await sql(db,`WITH pending AS (SELECT q.entity_id,q.requested_at,MAX(julianday(json_extract(r.normalized_json,'$.last_checked'))) AS source_check
    FROM recheck_requests q JOIN entity_records er ON er.entity_id=q.entity_id JOIN producer_records r ON r.id=er.record_id
    WHERE ${MEMBERSHIP} GROUP BY q.entity_id,q.requested_at)
    SELECT e.market,COUNT(*) AS pending_entities,MIN(p.requested_at) AS oldest_requested_at,
      SUM(CASE WHEN p.source_check>=julianday(p.requested_at) AND p.source_check<=julianday(?) THEN 1 ELSE 0 END) AS fresh_evidence_ack_eligible
    FROM pending p JOIN entities e ON e.id=p.entity_id GROUP BY e.market`,now).all()).results;
  const acknowledgements=await sql(db,'SELECT COUNT(*) AS acknowledged_last_24h,MAX(acknowledged_at) AS latest_acknowledgement FROM producer_recheck_acknowledgements WHERE acknowledged_at>=?',new Date(Date.parse(now)-86400000).toISOString()).first();
  return {pending_entities:rows.reduce((s,r)=>s+r.pending_entities,0),fresh_evidence_ack_eligible:rows.reduce((s,r)=>s+r.fresh_evidence_ack_eligible,0),by_country:rows,...acknowledgements,
    producer_completion:'Acknowledge only linked fresh accepted exports. V3 source verification and customer readiness are separate; a recheck acknowledgement never promotes a record.',pagination_supported:true,oldest_request_preserved:true};
}
