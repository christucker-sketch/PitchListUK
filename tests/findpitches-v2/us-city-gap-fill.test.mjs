import test from 'node:test';
import assert from 'node:assert/strict';
import {planUsCityGapFill} from '../../platform/findpitches-v2/geography/us-city-gap-fill.mjs';
const index={sources:{geography:'2025 Census Gazetteer',population:'2020 Census P1'},places:[
 {geoid:'0203000',state:'AK',name:'Anchorage municipality',classification:'incorporated',tier:'major_city',residents_2020:290000,population_resolved:true},
 {geoid:'1253000',state:'FL',name:'Orlando city',classification:'incorporated',tier:'major_city',residents_2020:307000,population_resolved:true},
 {geoid:'4835000',state:'TX',name:'Houston city',classification:'incorporated',tier:'major_city',residents_2020:2300000,population_resolved:true},
 {geoid:'4800001',state:'TX',name:'Rural Town',classification:'incorporated',tier:'regional_or_small',residents_2020:2000,population_resolved:true},
 {geoid:'4800002',state:'TX',name:'Unresolved city',classification:'incorporated',tier:'population_unresolved',residents_2020:null,population_resolved:false},
 {geoid:'4800003',state:'TX',name:'Township CDP',classification:'census_designated',tier:'separate_review',residents_2020:1500,population_resolved:true}
]};
test('state-first geographic seed choice keeps large states from hiding other states',()=>{
 const result=planUsCityGapFill(index,[{opportunity_id:'v1',venue_geoid:'4835000',
  venue_evidence_status:'verified_event_venue',customer_visibility:'visible_at_snapshot'}],{maxSeeds:4});
 assert.equal(result.states,3);
 assert.equal(result.addressable_incorporated,5);
 assert.equal(result.separate_cdps,1);
 assert.equal(result.unresolved_population_incorporated,1);
 assert.deepEqual(result.selected.slice(0,3).map(x=>x.state),['AK','FL','TX']);
 const houston=result.selected.find(x=>x.geoid==='4835000');
 assert.equal(houston.customer_ready_verified_count,1);
 assert.equal(houston.coverage_status,'verified_partial_coverage');
 assert.equal(result.selected.find(x=>x.state==='FL').coverage_status,'unknown_unresolved_venue_audit');
 assert.match(result.selected.find(x=>x.state==='FL').suggested_queries[0],/Orlando FL/);
 assert.equal(result.selected.some(x=>x.classification==='census_designated'),false);
});
test('no false zeros or invented assignments from unverified acquisitions',()=>{
 const result=planUsCityGapFill(index,[{opportunity_id:'v1',venue_geoid:'1253000',
  venue_evidence_status:'not_proven',customer_visibility:'visible_at_snapshot'}]);
 assert.equal(result.unresolved_venue_rows.length,1);
 assert.equal(result.selected.every(x=>x.customer_ready_verified_count===null),true);
 assert.equal(result.selected.every(x=>x.coverage_status==='unknown_unresolved_venue_audit'),true);
});
test('duplicate opportunity/geoid and invalid caps fail closed',()=>{
 assert.throws(()=>planUsCityGapFill(index,[{opportunity_id:'same'},{opportunity_id:'same'}]),/duplicate/);
 assert.throws(()=>planUsCityGapFill({...index,places:[index.places[0],index.places[0]]}),/duplicate_geoid/);
 assert.throws(()=>planUsCityGapFill(index,[],{maxSeeds:501}),/seed_cap/);
});
