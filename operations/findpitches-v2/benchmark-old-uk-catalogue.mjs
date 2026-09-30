#!/usr/bin/env node
import { opportunitySnapshot } from '../../functions/_data/opportunities.mjs';

const rows=Array.isArray(opportunitySnapshot?.rows)?opportunitySnapshot.rows:[];
const result={
 snapshot_exported_at:opportunitySnapshot?.exported_at??null,
 total:rows.length,
 quality_status:{},
 location_present:0,
 event_date_present:0,
 deadline_present:0,
 area_confidence:{},
 coordinate_precision:{},
 location_equals_county_or_region:0,
 customer_ready:{total:0,location_present:0,event_date_present:0,deadline_present:0,location_equals_county_or_region:0}
};
for(const row of rows){
 const quality=String(row.quality_status||'(none)');
 result.quality_status[quality]=(result.quality_status[quality]||0)+1;
 if(String(row.location||'').trim())result.location_present++;
 if(String(row.event_start||'').trim())result.event_date_present++;
 if(String(row.application_deadline||'').trim())result.deadline_present++;
 const ac=String(row.area_confidence||'(none)');
 result.area_confidence[ac]=(result.area_confidence[ac]||0)+1;
 const cp=String(row.coordinate_precision||'(none)');
 result.coordinate_precision[cp]=(result.coordinate_precision[cp]||0)+1;
 const location=norm(row.location),county=norm(row.county),region=norm(row.region);
 const broad=Boolean(location&&(location===county||location===region));
 if(broad)result.location_equals_county_or_region++;
 if(quality==='customer_ready'){
  result.customer_ready.total++;
  if(location)result.customer_ready.location_present++;
  if(String(row.event_start||'').trim())result.customer_ready.event_date_present++;
  if(String(row.application_deadline||'').trim())result.customer_ready.deadline_present++;
  if(broad)result.customer_ready.location_equals_county_or_region++;
 }
}
console.log(JSON.stringify(result,null,2));
function norm(v){return String(v||'').trim().toLowerCase();}
