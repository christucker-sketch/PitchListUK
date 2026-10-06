import test from 'node:test';
import assert from 'node:assert/strict';
import {selectAuditSample,assessUsefulness} from '../../operations/findpitches-v3/quality-audit.mjs';
test('a practical audit distinguishes source preservation from usable customer information',()=>{
  const fields={event_name:'River Craft Festival',canonical_url:'https://example.org/vendors',application_url:'https://example.org/vendors',organiser:'River Association',location:'River Hall',event_start:'2027-11-20',application_state:'OPEN_NOW'};
  const proofs=[{source_url:fields.canonical_url,evidence_json:'[{"excerpt":"Vendor applications open"}]'}];
  assert.equal(assessUsefulness({fields,proofs,market:'GB'}).classification,'clearly_usable');
  assert.equal(assessUsefulness({fields:{...fields,event_start:null,location:null},proofs,market:'GB'}).classification,'questionable');
  assert.equal(assessUsefulness({fields,proofs,market:'GB',sourceCountry:'US'}).classification,'wrong_unsafe');
});
test('deterministic diversity sampling keeps canonical identities unique',async()=>{
  const population=Array.from({length:200},(_,n)=>({record_id:'r'+n,entity_id:'e'+Math.floor(n/2),category:n%3?'source_refetch':'retained_evidence',identity_group:n%5?'new':'existing',market:n%7?'US':'NZ',platform:n%11?'direct-site':'eventeny.com'}));
  const a=await selectAuditSample(population,{size:40}),b=await selectAuditSample(population,{size:40});assert.deepEqual(a,b);assert.equal(new Set(a.map(r=>r.entity_id)).size,40);assert.ok(a.some(r=>r.market==='NZ'));assert.ok(a.some(r=>r.platform==='eventeny.com'));
});
