import {commercialRows,commercialEntity} from './commercial.mjs';
import {sql} from './store.mjs';

// Separate read-only preview. This never writes customer/publication tables.
export async function stagingReady(db,{market=null,after='',limit=50,region=null,location=null,now=new Date().toISOString()}={}) {
  if(!Number.isInteger(limit)||limit<1||limit>100||typeof after!=='string'||after.length>100||market&&!['GB','US','CA','AU','NZ','IE'].includes(market))throw Error('staging_filter_invalid');
  const needle=s=>String(s??'').toLowerCase();
  const ready=(await commercialRows(db,{market,onlyCachedReady:true,after})).map(r=>commercialEntity(r,now)).filter(r=>r.commercial&&r.ready&&(!region||needle(r.proof.facts.region_code).includes(needle(region)))&&(!location||needle(r.proof.facts.location).includes(needle(location))));
  const page=ready.slice(0,limit);return {schema:'findpitches-v3-staging-ready-v1',mode:'private_shadow_preview',as_of:now,publication_enabled:false,production_cutover_enabled:false,
    items:page.map(r=>({id:r.id,country:r.market,region:r.proof.facts.region_code??null,title:r.proof.facts.event_name,organiser:r.proof.facts.organiser,location:r.proof.facts.location,event_start:r.proof.facts.event_start,event_end:r.proof.facts.event_end,
      application_url:r.proof.facts.application_url,application_state:r.proof.facts.application_state,application_deadline:r.proof.facts.application_deadline??null,source_domain:r.domain,verified_at:r.checked_at,proof_expires_at:r.expires_at})),
    next_after:ready.length>limit?page.at(-1).id:null};
}

// Private service-binding projection, still source-proved shadow data. The
// independent producer's READY label is never sufficient for customer access.
export async function stagingCatalogue(db,{now=new Date().toISOString()}={}) {
  const [rows,policy]=await Promise.all([commercialRows(db,{onlyCachedReady:true}),sql(db,`SELECT er.entity_id,p.producer_record_id,p.normalized_json
    FROM entity_records er JOIN producer_records p ON p.id=er.record_id
    WHERE p.producer_name='independent-structured' AND p.environment='shadow' AND p.validation_status='accepted'
    AND NOT EXISTS(SELECT 1 FROM producer_records n WHERE n.producer_name=p.producer_name AND n.producer_record_id=p.producer_record_id AND n.environment=p.environment AND n.validation_status='accepted'
      AND (COALESCE(json_extract(n.normalized_json,'$.last_checked'),'')>COALESCE(json_extract(p.normalized_json,'$.last_checked'),'') OR COALESCE(json_extract(n.normalized_json,'$.last_checked'),'')=COALESCE(json_extract(p.normalized_json,'$.last_checked'),'') AND (n.received_at>p.received_at OR n.received_at=p.received_at AND n.id>p.id)))`).all()]);
  const held=new Set();for(const row of policy.results){const p=JSON.parse(row.normalized_json);if(p.confidence?.level==='LOW'||p.producer_channel&&p.producer_channel!=='current'||p.producer_export_readiness&&p.producer_export_readiness!=='READY')held.add(row.entity_id);}
  const ready=rows.map(r=>commercialEntity(r,now)).filter(r=>r.commercial&&r.ready&&!held.has(r.id));
  return {schema:'findpitches-v3-customer-proof-snapshot-v1',as_of:now,publication_enabled:false,production_cutover_enabled:false,
    shadow_ready:rows.map(r=>commercialEntity(r,now)).filter(r=>r.commercial&&r.ready).length,producer_policy_withheld:rows.filter(r=>held.has(r.id)).length,
    items:ready.map(r=>({id:r.id,country:r.market,region:r.proof.facts.region_code??null,title:r.proof.facts.event_name,organiser:r.proof.facts.organiser,location:r.proof.facts.location,
      event_start:r.proof.facts.event_start,event_end:r.proof.facts.event_end,application_url:r.proof.facts.application_url,application_state:r.proof.facts.application_state,
      application_deadline:r.proof.facts.application_deadline??null,source_url:r.proof.event_source_url??r.proof.source_url??null,source_domain:r.domain,
      verified_at:r.checked_at,proof_expires_at:r.expires_at,entity_revision:r.revision,verification_id:r.proof_sequence,
      // Category, sells, fees and coordinates are not in current source-proof
      // facts. Their absence is honest; producer labels cannot fill these gaps.
      opportunity_type:null,vendor_categories:[]}))};
}
