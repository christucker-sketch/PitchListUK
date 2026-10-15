// Synthetic customer proof/service fixture. Never imported by runtime/deploy code.
import fs from 'node:fs';
import {openLocalD1} from '../../../operations/findpitches-v3/local-d1.mjs';
export function localisationFixture() {
  const db=openLocalD1(':memory:',{migrationsDirectory:new URL('../../../operations/findpitches-v3/customer-migrations/',import.meta.url)});
  const now=new Date().toISOString();
  const items=['GB','US','FR'].map((country,i)=>({id:'ent_'+String(i+1).repeat(32),country,
    // Deliberately collide with interface catalog keys: these must stay original.
    title:i===0?'Taking applications':i===1?'Food':'Marché des créateurs',organiser:'Market',
    location:i===0?'Town Hall, Kent':i===1?'Fair Hall, Austin, TX':'Salle des fêtes, Paris',
    region:i===0?'South East':i===1?'TX':'FR-IDF',
    event_start:'2099-11-03',event_end:'2099-11-04',application_url:'https://organiser.example.org/apply',
    application_state:i===2?'ENQUIRY_AVAILABLE':'OPEN_NOW',source_url:'https://organiser.example.org/event',
    source_domain:'organiser.example.org',verified_at:now,proof_expires_at:'2099-12-31T00:00:00Z',
    entity_revision:1,verification_id:i+1}));
  const env={V3_CUSTOMER_DB:db,V3_CUSTOMER_MODE:'restricted_shadow_preview',V3_STRIPE_MODE:'test',
    V3_CHECKOUT_ENABLED:'disabled',STRIPE_PRICE_ID:'price_fixture',V3_SESSION_SECRET:'fixture_session_'.repeat(5),
    V3_PREVIEW_OPERATOR_TOKEN:'fixture_operator_'.repeat(5),V3_STAGING_TOKEN:'fixture_staging_'.repeat(5),
    V3_READY_API:{fetch:async()=>Response.json({schema:'findpitches-v3-customer-proof-snapshot-v1',as_of:new Date().toISOString(),
      publication_enabled:false,production_cutover_enabled:false,shadow_ready:items.length,producer_policy_withheld:0,items})},
    ASSETS:{fetch:async input=>{const name=new URL(typeof input==='string'?input:input.url).pathname.slice(1);if(name.includes('..'))return new Response('',{status:404});try{return new Response(fs.readFileSync(new URL('../../../web/findpitches-v3-web/public/'+name,import.meta.url)),{headers:{'Content-Type':name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.svg')?'image/svg+xml':name.endsWith('.woff2')?'font/woff2':'text/html'}});}catch{return new Response('',{status:404});}}}};
  return {db,env,items,now};
}
