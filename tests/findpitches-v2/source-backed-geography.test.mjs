import test from 'node:test';
import assert from 'node:assert/strict';
import {extractSupportedAreaEvidence} from '../../platform/findpitches-v2/enrichment/run-batch.mjs';

test('source corroboration accepts punctuation-equivalent US city and state code as place evidence',()=>{
 const geography={country_code:'US',region_code:'CA',region:'Los Angeles CA'};
 const docs=[{url:'https://event.test/vendors',text:'Vendor applications are open for our festival in Los Angeles, CA this autumn.'}];
 const field=extractSupportedAreaEvidence(geography,docs);
 assert.equal(field.value,'Los Angeles CA');
 assert.equal(field.precision,'place');
 assert.equal(field.evidence[0].source,'https://event.test/vendors');
});

test('source corroboration accepts full US state name equivalent for city acquisition',()=>{
 const geography={country_code:'US',region_code:'TX',region:'Houston TX'};
 const docs=[{url:'https://event.test/apply',text:'Apply to trade at our Houston, Texas market event.'}];
 const field=extractSupportedAreaEvidence(geography,docs);
 assert.equal(field.value,'Houston TX');
 assert.equal(field.precision,'place');
});

test('discovery geography is not promoted when the source does not independently mention it',()=>{
 const geography={country_code:'US',region_code:'OR',region:'Portland OR'};
 const docs=[{url:'https://event.test/apply',text:'Vendor applications are now open for this annual market.'}];
 assert.equal(extractSupportedAreaEvidence(geography,docs),null);
});

test('office/contact mentions never corroborate customer location',()=>{
 const geography={country_code:'US',region_code:'CA',region:'Los Angeles CA'};
 const docs=[{url:'https://event.test/contact',text:'Vendor applications: contact our Los Angeles, California office for details.'}];
 assert.equal(extractSupportedAreaEvidence(geography,docs),null);
});

test('ordinary source-backed region remains area precision',()=>{
 const geography={country_code:'GB',region_code:'GB-ENG-KENT',region:'Kent'};
 const docs=[{url:'https://event.test/fair',text:'Applications are open for traders at our Kent summer fair.'}];
 const field=extractSupportedAreaEvidence(geography,docs);
 assert.equal(field.value,'Kent');
 assert.equal(field.precision,'area');
});
