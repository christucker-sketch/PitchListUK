import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCustomerSearchDocument } from '../../platform/findpitches-v2/customer/search-document.mjs';

test('adaptive offerings are both displayable and searchable',()=>{
 const d=buildCustomerSearchDocument({
  id:'opp-1',market:'GB',title:'World Food Festival',organiser:'Example Events',location:'Birmingham',
  region_code:'GB-ENG-WEST-MIDS',
  offerings:[
   {label:'Jamaican jerk',kind:'street food',cuisine:'Jamaican',product:'jerk chicken'},
   {label:'Ethiopian injera',kind:'food',cuisine:'Ethiopian'}
  ]
 });
 assert.equal(d.display.offerings[0].label,'Jamaican jerk');
 for (const term of ['Jamaican jerk','street food','Jamaican','jerk chicken','Ethiopian injera','Ethiopian']) {
   assert.ok(d.searchable_terms.includes(term),term);
 }
 assert.match(d.search_text,/Jamaican jerk/);
});

test('new cuisine needs no taxonomy update',()=>{
 const d=buildCustomerSearchDocument({offerings:[{label:'Trinidadian doubles',kind:'food',cuisine:'Trinidadian'}]});
 assert.deepEqual(d.offering_terms,['Trinidadian doubles','food','Trinidadian']);
});

test('search terms deduplicate case-insensitively',()=>{
 const d=buildCustomerSearchDocument({title:'Ceramics Fair',offerings:[{label:'Ceramics',kind:'craft',product:'ceramics'}]});
 assert.equal(d.searchable_terms.filter(x=>x.toLowerCase()==='ceramics').length,1);
});
