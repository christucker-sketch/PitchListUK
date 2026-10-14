import test from'node:test';import assert from'node:assert/strict';import{previewCommercialDisclosure}from'../../platform/findpitches-v3/commercial-disclosure-preview.mjs';
const row=(id,locked=true)=>({id,market:'US',title:'Named Fair',type:null,type_label:'Event',organiser:{name:'Named organiser'},location:{label:'1 Named Street',region_id:'us/texas',region_name:'Texas',lat:30,lng:-97},dates:{start:'2026-11-21'},application:{status:'open',label:'Taking applications',deadline:'2026-11-20'},access:{locked,source_url:locked?null:'https://official.example.org/event',application_url:locked?null:'https://official.example.org/apply'},canonical_path:'/us/opportunities/'+id+'/',is_current:true});
test('review disclosure preserves counts and source input while withholding identity and unsampled pins',()=>{
 const data={total:100,next_start:'2026-11-21',results:[row('one'),row('two')],map_points:[{id:'one',title:'Named Fair',lat:30,lng:-97},{id:'two',title:'Other Fair',lat:31,lng:-96}],facets:{regions:{'us/texas':100}}},original=JSON.stringify(data),out=previewCommercialDisclosure(data,{sampleIds:['one']});
 assert.equal(out.total,100);assert.deepEqual(out.facets,data.facets);assert.equal(out.results[0].title,'Named Fair');assert.equal(out.results[1].identity_locked,true);assert.equal(out.map_points.length,1);
 const hidden=JSON.stringify(out.results[1]);for(const secret of ['Named Fair','Named organiser','Named Street','2026-11-21','canonical_path','lat','lng','official.example.org'])assert.equal(hidden.includes(secret),false);
 assert.equal(JSON.stringify(data),original);assert.equal(out.production_enabled,false);
});
test('existing canonical Pro redaction determines visibility; fixed samples cannot grow with pagination',()=>{
 const paid=row('paid',false),out=previewCommercialDisclosure({results:[paid],map_points:[{id:'paid'},{id:'another-pro-page'}]});assert.deepEqual(out.results[0],paid);assert.equal(out.map_points.length,2);
 assert.throws(()=>previewCommercialDisclosure({results:[]},{sampleIds:Array.from({length:9},(_,i)=>String(i))}),/bounded/);
 assert.throws(()=>previewCommercialDisclosure({results:[]},{sampleIds:['one','one']}),/bounded/);
 assert.equal(previewCommercialDisclosure({results:[row('different-page')],map_points:[]},{sampleIds:['one']}).results[0].identity_locked,true);
});
