import test from 'node:test';
import assert from 'node:assert/strict';
import { planUsPlaceCoverage } from '../../platform/findpitches-v2/geography/us-place-coverage.mjs';

const index={places:[
 { geoid:'0612345',state:'CA',name:'Example city',residents_2020:200000,tier:'major_city',classification:'incorporated',population_resolved:true },
 { geoid:'0612346',state:'CA',name:'Other city',residents_2020:110000,tier:'major_city',classification:'incorporated',population_resolved:true },
 { geoid:'1836003',state:'IN',name:'Indianapolis (balance)',residents_2020:887642,tier:'separate_review',classification:'review_lsad',population_resolved:true },
 { geoid:'0600001',state:'CA',name:'Small town',residents_2020:2000,tier:'regional_or_small',classification:'incorporated',population_resolved:true }
]};

test('partial snapshot never presents an unmeasured city as zero coverage',()=>{
 const plan=planUsPlaceCoverage(index,[
  {opportunity_id:'a',venue_geoid:'0612345',venue_evidence_status:'verified_event_venue',customer_visibility:'visible_at_snapshot'},
  {opportunity_id:'b',venue_geoid:'0600001',venue_evidence_status:'verified_event_venue',customer_visibility:'visible_at_snapshot'},
  {opportunity_id:'c',venue_geoid:'0612346',venue_evidence_status:'organiser_office',customer_visibility:'visible_at_snapshot'},
  {opportunity_id:'d',venue_geoid:'9999999',venue_evidence_status:'verified_event_venue',customer_visibility:'visible_at_snapshot'}
 ]);
 assert.equal(plan.priority_places.length,3);
 assert.equal(plan.priority_places.find(p=>p.geoid==='0612345').customer_ready_count,1);
 assert.equal(plan.priority_places.find(p=>p.geoid==='0612346').customer_ready_count,null);
 assert.equal(plan.priority_places.find(p=>p.geoid==='0612346').coverage_status,'unknown_incomplete_snapshot');
 assert.equal(plan.priority_places.find(p=>p.geoid==='1836003').priority_tier,'large_special_government_review');
 assert.equal(plan.state_summary.find(s=>s.state==='CA').zero_target_places,null);
 assert.deepEqual(plan.unresolved_venue_rows.map(p=>p.opportunity_id),['c','d']);
});

test('complete verified snapshot may show zero but never counts organiser addresses',()=>{
 const plan=planUsPlaceCoverage(index,[
  {opportunity_id:'a',venue_geoid:'0612345',venue_evidence_status:'verified_event_venue',customer_visibility:'visible_at_snapshot'},
  {opportunity_id:'b',venue_geoid:'0612345',venue_evidence_status:'verified_event_venue',customer_visibility:'visible_at_snapshot'},
  {opportunity_id:'c',venue_geoid:'1836003',venue_evidence_status:'organiser_office',customer_visibility:'visible_at_snapshot'}
 ],{completeSnapshot:true});
 assert.equal(plan.priority_places.find(p=>p.geoid==='0612345').customer_ready_count,2);
 assert.equal(plan.priority_places.find(p=>p.geoid==='0612346').customer_ready_count,0);
 assert.equal(plan.state_summary.find(s=>s.state==='CA').zero_target_places,1);
 assert.equal(plan.priority_places.find(p=>p.geoid==='1836003').customer_ready_count,0);
});

test('ambiguous, missing and repeated opportunity IDs are not silently counted',()=>{
 assert.throws(()=>planUsPlaceCoverage(index,[{venue_geoid:'0612345'}]),/id_required/);
 assert.throws(()=>planUsPlaceCoverage(index,[
  {opportunity_id:'a',venue_geoid:'0612345',venue_evidence_status:'verified_event_venue',customer_visibility:'visible_at_snapshot'},
  {opportunity_id:'a',venue_geoid:'0612346',venue_evidence_status:'verified_event_venue',customer_visibility:'visible_at_snapshot'}
 ]),/duplicate_venue_opportunity/);
 assert.throws(()=>planUsPlaceCoverage({places:[index.places[0],index.places[0]]}),/duplicate_place_geoid/);
});
