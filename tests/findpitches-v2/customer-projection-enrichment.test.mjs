import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEnrichment } from '../../platform/findpitches-v2/customer/enrichment.mjs';
import { projectCustomerOpportunity } from '../../platform/findpitches-v2/customer/project.mjs';

test('normalized evidence enrichment projects plain customer values and retains provenance',()=>{
 const enrichment=normalizeEnrichment({
  organiser:{value:'Kent Events',evidence:[{source:'https://example.test',excerpt:'Organised by Kent Events'}],confidence:.9},
  location:{value:'Maidstone',confidence:.8},
  coordinates:{value:{lat:51.27,lng:.52},confidence:.95},
  offerings:{value:[{label:'Jamaican jerk',kind:'food',cuisine:'Jamaican',product:'jerk chicken'}],confidence:.85},
  recurring:{value:true,confidence:.7},
  description:{value:'Independent traders wanted'}
 });
 const result=projectCustomerOpportunity({id:'x',market:'GB',region_code:'GB-ENG-KENT',event_name:'Food Fair',canonical_url:'https://example.test',application_url:'https://example.test/apply',last_checked:'2026-09-26',status:'validated',score:80},enrichment);
 assert.equal(result.opportunity.organiser,'Kent Events');
 assert.equal(result.opportunity.coordinates.lat,51.27);
 assert.equal(result.opportunity.offerings[0].cuisine,'Jamaican');
 assert.equal(result.opportunity.recurring,true);
 assert.equal(result.provenance.organiser.confidence,.9);
 assert.equal(result.provenance.organiser.evidence[0].source,'https://example.test');
 assert.equal(result.readiness.ready,true);
});

test('legacy sells enrichment is not projected',()=>{
 const result=projectCustomerOpportunity({id:'x',market:'GB',region_code:'GB-ENG-KENT',event_name:'Fair',canonical_url:'https://x.test',application_url:'https://x.test/apply',last_checked:'2026-09-26'},{sells:['food']});
 assert.equal(result.opportunity.offerings,null);
});
