#!/usr/bin/env node
// Combines a private live snapshot, bounded evidence re-fetch and manual venue
// decisions. It verifies every accepted 7-digit GEOID against the Census file.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseGazetteerPlaces } from '../../../platform/findpitches-v2/geography/us-place-index.mjs';

const [auditPath,evidencePath,gazetteerPath,outputPath]=process.argv.slice(2);
if(!outputPath)throw new Error('Usage: compile-us-venue-review.mjs <audit.json> <evidence.json> <gazetteer.txt> <output.json>');
const audit=JSON.parse(await readFile(resolve(auditPath),'utf8'));
const evidence=JSON.parse(await readFile(resolve(evidencePath),'utf8'));
const decisions=JSON.parse(await readFile(new URL('../../../platform/findpitches-v2/quality/us-venue-review-2026-09-29.json',import.meta.url),'utf8'));
const places=new Map(parseGazetteerPlaces(await readFile(resolve(gazetteerPath),'utf8')).map(p=>[p.geoid,p]));
const evidenceById=new Map(evidence.results.map(row=>[row.opportunity_id,row]));
const decisionById=new Map(decisions.map(row=>[row.opportunity_id,row]));
if(decisionById.size!==decisions.length)throw new Error('findpitches_us_venue_duplicate_decision');
for(const decision of decisions){
  const place=places.get(decision.venue_geoid);
  if(!place||place.state!==decision.state||place.name!==decision.place)throw new Error('findpitches_us_venue_bad_geoid:'+decision.opportunity_id);
}
const rows=audit.inventory.visible.map(opportunity=>{
  const fetched=evidenceById.get(opportunity.id),decision=decisionById.get(opportunity.id);
  if(decision)return {opportunity_id:opportunity.id,acquisition_state:opportunity.region_code,
    customer_visibility:'visible_at_snapshot',venue_evidence_status:'verified_event_venue',
    venue_geoid:decision.venue_geoid,venue_state:decision.state,venue_place:decision.place,note:decision.note||null};
  const reason=!fetched||fetched.status!=='fetched'?'evidence_source_unavailable_at_audit':
    !fetched.location_present&&!fetched.excerpt_present?'stored_evidence_not_reproduced':
    'stored_location_evidence_not_a_specific_event_venue';
  return {opportunity_id:opportunity.id,acquisition_state:opportunity.region_code,
    customer_visibility:'visible_at_snapshot',venue_evidence_status:'unresolved',venue_geoid:null,
    venue_state:null,venue_place:null,reason};
});
for(const decision of decisions)if(!rows.some(row=>row.opportunity_id===decision.opportunity_id))throw new Error('findpitches_us_venue_decision_not_visible:'+decision.opportunity_id);
const byReason=rows.filter(row=>row.venue_evidence_status==='unresolved').reduce((out,row)=>{out[row.reason]=(out[row.reason]||0)+1;return out;},{});
const verified=rows.filter(row=>row.venue_evidence_status==='verified_event_venue');
const byVenueState=verified.reduce((out,row)=>{out[row.venue_state]=(out[row.venue_state]||0)+1;return out;},{});
const output={snapshot_at:audit.snapshot_at,compiled_at:new Date().toISOString(),counts:{customer_visible:rows.length,
  verified_event_venues:verified.length,matched_census_geoids:verified.filter(row=>row.venue_geoid).length,
  unresolved:rows.length-verified.length},unresolved_reasons:byReason,verified_by_venue_state:byVenueState,rows};
await writeFile(resolve(outputPath),JSON.stringify(output,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({output:resolve(outputPath),...output.counts,unresolved_reasons:byReason,verified_by_venue_state:byVenueState}));
