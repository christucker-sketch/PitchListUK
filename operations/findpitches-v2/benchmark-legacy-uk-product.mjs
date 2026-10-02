#!/usr/bin/env node
import { opportunitySnapshot } from '../../functions/_data/opportunities.mjs';

const rows=Array.isArray(opportunitySnapshot?.rows)?opportunitySnapshot.rows:[];
const ready=rows.filter(row=>row.quality_status==='customer_ready'||row.publishable===true);
const normalize=v=>String(v||'').trim().toLowerCase().replace(/\s+/g,' ');
const same=(a,b)=>normalize(a)&&normalize(a)===normalize(b);
const stats={
 snapshot_exported_at:opportunitySnapshot?.exported_at||null,
 total:rows.length,
 customer_ready:ready.length,
 ready_with_location:0,
 ready_location_equals_county_or_region:0,
 ready_with_inferred_area_note:0,
 ready_without_event_start:0,
 ready_without_application_deadline:0,
 ready_without_event_start_or_deadline:0,
 ready_coordinate_precision:{area:0,place:0,none:0,other:0},
 ready_route_type:{},
 examples_are_not_emitted:true
};
for(const row of ready){
 if(normalize(row.location))stats.ready_with_location++;
 if((row.county&&same(row.location,row.county))||(row.region&&same(row.location,row.region)))stats.ready_location_equals_county_or_region++;
 if(/\barea enrichment\b[^|\n]*\binferred\b/i.test(String(row.notes||'')))stats.ready_with_inferred_area_note++;
 const noDate=!normalize(row.event_start),noDeadline=!normalize(row.application_deadline);
 if(noDate)stats.ready_without_event_start++;
 if(noDeadline)stats.ready_without_application_deadline++;
 if(noDate||noDeadline)stats.ready_without_event_start_or_deadline++;
 const precision=normalize(row.coordinate_precision);
 if(precision==='area')stats.ready_coordinate_precision.area++;
 else if(precision==='place')stats.ready_coordinate_precision.place++;
 else if(!precision)stats.ready_coordinate_precision.none++;
 else stats.ready_coordinate_precision.other++;
 const route=String(row.route_type||'(none)');
 stats.ready_route_type[route]=(stats.ready_route_type[route]||0)+1;
}
stats.ready_route_type=Object.fromEntries(Object.entries(stats.ready_route_type).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])));
console.log(JSON.stringify(stats,null,2));
