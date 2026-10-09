import {sql} from './store.mjs';
import {hash} from './contract.mjs';
import {producerRecheckStatus} from './rechecks.mjs';

export async function noteDeliveryContact(db,{kind,environment='shadow',records=[],receipt={},now=new Date().toISOString()}) {
  const checked=records.map(r=>r.last_checked).filter(t=>typeof t==='string'&&Number.isFinite(Date.parse(t))).sort((a,b)=>Date.parse(a)-Date.parse(b)).at(-1)??null;
  await sql(db,`INSERT INTO structured_delivery_contacts(id,kind,environment,received_at,records,accepted,inserted,duplicates,rejected,batch_hash,source_last_checked)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`,crypto.randomUUID(),kind,environment,now,records.length,receipt.accepted??0,receipt.inserted??0,receipt.duplicates??0,receipt.rejected??0,records.length?await hash(records):null,checked).run();
}
export async function structuredDeliveryStatus(db,now=new Date().toISOString()) {
  const contacts=(await sql(db,"SELECT received_at FROM structured_delivery_contacts WHERE kind='rechecks' AND environment='shadow' ORDER BY received_at DESC LIMIT 4").all()).results;
  const intervals=contacts.slice(1).map((row,i)=>(Date.parse(contacts[i].received_at)-Date.parse(row.received_at))/1000);
  const last=contacts[0]?.received_at??null;
  const source=await sql(db,`SELECT COUNT(*) AS immutable_receipts,COUNT(DISTINCT producer_record_id) AS producer_ids,
    MAX(received_at) AS last_new_receipt_at,MAX(json_extract(normalized_json,'$.last_checked')) AS source_last_checked
    FROM producer_records WHERE producer_name='independent-structured' AND environment='shadow'`).first();
  const active=last!==null&&Date.parse(now)-Date.parse(last)<=1800000;
  return {cloud_ready:true,expected_interval_seconds:900,contact_observation_started:true,last_authenticated_recheck_poll:last,
    recent_poll_intervals_seconds:intervals,host_recently_contacting:active,cadence_verified:active&&intervals.length>=2&&intervals.slice(0,2).every(n=>n>=600&&n<=1200),
    freshness_warning:!source.source_last_checked||Date.parse(now)-Date.parse(source.source_last_checked)>3600000,
    ...source,rechecks:await producerRecheckStatus(db,now),interpretation:'Authenticated runner recheck polls prove contact even when checkpointed exports cause no import. They do not prove fresh source acquisition. Diagnostic probe polls and subsequent pagination pages are excluded.'};
}
