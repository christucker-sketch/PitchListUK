import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEnrichment } from '../../platform/findpitches-v2/customer/enrichment.mjs';

test('unknown enrichment stays unknown',()=>{
 const e=normalizeEnrichment({});
 assert.equal(e.organiser,null);
 assert.equal(e.offerings,null);
 assert.equal(e.recurring,null);
});

test('customer fields retain their evidence and confidence',()=>{
 const e=normalizeEnrichment({organiser:{value:'Town Council',confidence:0.9,evidence:[{source:'https://example.test/apply',excerpt:'Organised by Town Council'}]}});
 assert.equal(e.organiser.value,'Town Council');
 assert.equal(e.organiser.confidence,0.9);
 assert.equal(e.organiser.evidence[0].source,'https://example.test/apply');
});

test('offerings remain adaptive rather than fixed taxonomy',()=>{
 const e=normalizeEnrichment({offerings:{value:[
   {label:'Trinidadian doubles',kind:'food',cuisine:'Trinidadian'},
   {label:'Hand-thrown stoneware',kind:'craft',product:'ceramics'}
 ],evidence:['https://example.test/traders']}});
 assert.equal(e.offerings.value[0].cuisine,'Trinidadian');
 assert.equal(e.offerings.value[1].product,'ceramics');
});

test('recurring is never inferred from a truthy string',()=>{
 const e=normalizeEnrichment({recurring:'yes'});
 assert.equal(e.recurring,null);
});
