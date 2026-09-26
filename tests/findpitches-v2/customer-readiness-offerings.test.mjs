import test from 'node:test';
import assert from 'node:assert/strict';
import { assessCustomerReadiness, CUSTOMER_READY_ENRICHMENT_FIELDS } from '../../platform/findpitches-v2/customer/readiness.mjs';

const base={id:'1',market:'GB',title:'Festival',region_code:'GB-ENG-KENT',canonical_url:'https://example.test',application_url:'https://example.test/apply',last_checked:'2026-09-26T00:00:00Z'};

test('readiness names adaptive offerings, not legacy sells',()=>{
 assert.ok(CUSTOMER_READY_ENRICHMENT_FIELDS.includes('offerings'));
 assert.ok(!CUSTOMER_READY_ENRICHMENT_FIELDS.includes('sells'));
});
test('arbitrary authentic offerings are structurally valid',()=>{
 const r=assessCustomerReadiness({...base,offerings:[
  {label:'Ethiopian injera',kind:'food',cuisine:'Ethiopian'},
  {label:'Korean corn dogs',kind:'street food',cuisine:'Korean'},
  {label:'Handmade ceramics',kind:'craft',product:'stoneware'}
 ]});
 assert.equal(r.ready,true);
});
test('offering vocabulary is not constrained to an enum',()=>{
 const r=assessCustomerReadiness({...base,offerings:[{label:'Trinidadian doubles',kind:'whatever-real-world-kind-emerges',cuisine:'Trinidadian'}]});
 assert.equal(r.ready,true);
});
test('malformed offering structures fail readiness',()=>{
 assert.equal(assessCustomerReadiness({...base,offerings:{label:'Jerk chicken'}}).ready,false);
 assert.equal(assessCustomerReadiness({...base,offerings:[{kind:'food'}]}).ready,false);
});
