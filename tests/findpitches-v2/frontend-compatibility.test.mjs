import test from 'node:test';
import assert from 'node:assert/strict';
import {toFrontendCompatibleOpportunity} from '../../platform/findpitches-v2/customer/frontend-compatibility.mjs';

test('compatibility mapper preserves familiar fields and adds evidence metadata',()=>{
 const mapped=toFrontendCompatibleOpportunity({
  opportunity:{
   id:'x',market:'GB',title:'Autumn Fair',organiser:'Town Council',region_code:'GB-ENG-KENT',
   location:'Kent',location_precision:'area',location_confidence:.72,venue_verified:false,
   event_start:null,event_end:null,application_deadline:null,
   canonical_url:'https://event.test/fair',application_url:'https://event.test/apply',last_checked:'2026-09-30'
  },
  readiness:{ready:true,schema_version:'2026-09-30.practical-v1',
   completeness:{venue:false,event_date:false,application_deadline:false}}
 });
 assert.equal(mapped.location,'Kent');
 assert.equal(mapped.application_url,'https://event.test/apply');
 assert.equal(mapped.metadata.location_precision,'area');
 assert.equal(mapped.metadata.venue_verified,false);
 assert.equal(mapped.metadata.usable,true);
 assert.deepEqual(mapped.metadata.completeness,{venue:false,event_date:false,application_deadline:false});
});

test('compatibility metadata does not manufacture a location',()=>{
 const mapped=toFrontendCompatibleOpportunity({opportunity:{id:'x',location:null},readiness:{ready:false,completeness:{}}});
 assert.equal(mapped.location,null);
 assert.equal(mapped.metadata.location_precision,null);
 assert.equal(mapped.metadata.usable,false);
});
