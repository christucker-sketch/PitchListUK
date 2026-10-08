import {commercialRows,commercialEntity} from './commercial.mjs';

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
