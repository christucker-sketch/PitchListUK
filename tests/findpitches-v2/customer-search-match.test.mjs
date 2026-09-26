import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCustomerSearchDocument } from '../../platform/findpitches-v2/customer/search-document.mjs';
import { filterCustomerSearch, matchesCustomerSearch } from '../../platform/findpitches-v2/customer/search-match.mjs';

const docs=[
 buildCustomerSearchDocument({id:'1',market:'GB',region_code:'GB-ENG-WEST-MIDS',title:'World Food Festival',location:'Birmingham',offerings:[{label:'Jamaican jerk',kind:'street food',cuisine:'Jamaican',product:'jerk chicken'}]}),
 buildCustomerSearchDocument({id:'2',market:'GB',region_code:'GB-ENG-KENT',title:'Craft Fair',location:'Kent',offerings:[{label:'Handmade ceramics',kind:'craft',product:'stoneware'}]})
];

test('free text finds adaptive listing metadata',()=>assert.equal(filterCustomerSearch(docs,{q:'jerk chicken'}).length,1));
test('offering filter searches offering metadata only',()=>assert.equal(filterCustomerSearch(docs,{offering:'street food'})[0].id,'1'));
test('cuisine filter uses adaptive cuisine values',()=>assert.equal(filterCustomerSearch(docs,{cuisine:'Jamaican'})[0].id,'1'));
test('market and region filters combine with terms',()=>assert.equal(filterCustomerSearch(docs,{market:'gb',region_code:'GB-ENG-KENT',q:'ceramics'})[0].id,'2'));
test('accent normalization keeps emerging cuisine searchable',()=>{
 const d=buildCustomerSearchDocument({offerings:[{label:'Vegan pâtisserie',kind:'food',cuisine:'French'}]});
 assert.equal(matchesCustomerSearch(d,{offering:'patisserie'}),true);
});
