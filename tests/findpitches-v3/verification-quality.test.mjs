import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreVerifiedRecord} from '../../operations/findpitches-v3/verify-quality.mjs';
test('quality scoring distinguishes material vendor gaps and quarantine from repaired usability',()=>{
  const facts={event_name:'River Fair',country:'US',location:'River Hall',event_start:'2026-11-21',organiser:'River Arts'};
  assert.equal(scoreVerifiedRecord({proof:{status:'partial',facts,reasons:['vendor_application_not_proved']},readiness:'watch'}),'questionable');
  assert.equal(scoreVerifiedRecord({proof:{status:'quarantine',facts,reasons:['source_country_market_mismatch']},readiness:'blocked',prior:'wrong_unsafe'}),'wrong_unsafe','Withholding a bad record is not a quality repair');
  assert.equal(scoreVerifiedRecord({proof:{status:'unverified',facts,reasons:[]},readiness:'ready'}),'questionable','Expired proof cannot inherit a cached READY score');
  const complete={...facts,application_url:'https://example.org/vendor/river',application_state:'OPEN_NOW'};
  assert.equal(scoreVerifiedRecord({proof:{status:'verified',facts:complete,reasons:[]},readiness:'ready'}),'clearly_usable');
  assert.equal(scoreVerifiedRecord({proof:{status:'partial',facts:{...complete,organiser:null},reasons:['verified_organiser_missing']},readiness:'blocked'}),'usable_minor_missing');
});
