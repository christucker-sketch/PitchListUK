import test from 'node:test';
import assert from 'node:assert/strict';
import { practicalApiRecord } from '../../platform/findpitches-v2/customer/practical-api-record.mjs';

test('compatibility adapter preserves scalar location and adds precision metadata',()=>{
 const row=practicalApiRecord({
  opportunity:{
   id:'x',market:'GB',title:'Fair',location:'Kent',location_precision:'area',
   location_confidence:.72,venue_verified:false,canonical_url:'https://event.test',
   application_url:'https://event.test/apply',last_checked:'2026-09-30'
  },
  readiness:{
   ready:true,schema_version:'2026-09-30.practical-v1',
   completeness:{venue:false,event_date:false,application_deadline:false}
  },
  provenance:{location:{evidence:[{source:'https://event.test',excerpt:'Fair in Kent'}]}}
 });
 assert.equal(row.location,'Kent');
 assert.equal(row.location_precision,'area');
 assert.equal(row.venue_verified,false);
 assert.equal(row.readiness.usable,true);
 assert.deepEqual(row.completeness,{venue:false,event_date:false,application_deadline:false});
});

test('compatibility adapter does not invent absent optional data',()=>{
 const row=practicalApiRecord({});
 assert.equal(row.location,null);
 assert.equal(row.location_precision,null);
 assert.equal(row.event_start,null);
 assert.equal(row.application_deadline,null);
 assert.equal(row.readiness.usable,false);
});
