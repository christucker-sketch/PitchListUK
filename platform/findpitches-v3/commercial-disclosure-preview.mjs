// Review candidate only. Intentionally not imported by the customer Worker.
// Chris/ChatGPT must record the final product rule before runtime integration.
export const DISCLOSURE_REVIEW_POLICY='review-free-identity-v1';
export function previewCommercialDisclosure(result,{sampleIds=[],maximumSamples=8}={}){
 if(!Number.isInteger(maximumSamples)||maximumSamples<0||maximumSamples>8||!Array.isArray(sampleIds)||sampleIds.length>maximumSamples||new Set(sampleIds).size!==sampleIds.length)throw Error('fixed_bounded_review_sample_required');
 const samples=new Set(sampleIds),out=structuredClone(result),entitled=out.results.length>0&&out.results.every(r=>r.access?.locked===false);
 out.results=out.results.map(row=>{
  // Existing canonical runtime entitlement remains the authority. A request
  // parameter claiming Pro is not accepted by this preview transform.
  if(row.access?.locked===false||samples.has(row.id))return row;
  return {id:row.id,market:row.market,title:'Verified opportunity',identity_locked:true,type:row.type,type_label:row.type_label,
   location:{country_code:row.market,label:row.location.region_name??row.market,region_id:row.location.region_id,region_name:row.location.region_name,precision:'region'},
   dates:{month:row.dates.start?.slice(0,7)??null},application:{status:row.application.status,label:row.application.label},
   access:{locked:true,identity_locked:true,source_url:null,application_url:null},is_current:row.is_current};
 });
 // Pins, titles and coordinates can reveal an unsampled event as easily as
 // a list card. Apply the same fixed sample across pages/filters/endpoints.
 out.map_points=entitled?(out.map_points??[]):(out.map_points??[]).filter(p=>samples.has(p.id));
 if(!out.results.some(r=>r.access?.locked===false))out.next_start=out.next_start?.slice(0,7)??null;
 return {...out,review_policy:DISCLOSURE_REVIEW_POLICY,production_enabled:false};
}
