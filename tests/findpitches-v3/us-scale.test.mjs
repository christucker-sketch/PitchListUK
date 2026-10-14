import test from'node:test';import assert from'node:assert/strict';
import {database,NOW}from'./helpers.mjs';import {sql}from'../../platform/findpitches-v3/store.mjs';
import {allocateArms,armScore,failureBucket,recordExperiment,rankArms}from'../../operations/findpitches-v3/us-scale.mjs';
import {robotsPermits,publicRobotsAllowed}from'../../platform/findpitches-v3/source-robots.mjs';
import {operatorPageLinks}from'../../platform/findpitches-v3/source-catalogue.mjs';
import {sourceUSState,sourceVenueAddress}from'../../platform/findpitches-v3/source-coordinates.mjs';
import {documentFixture}from'./verification-fixture.mjs';import {verifyDocument}from'../../platform/findpitches-v3/verification.mjs';
import {recordVerification}from'../../platform/findpitches-v3/verification-store.mjs';import {seed,record}from'./helpers.mjs';
test('source scoring rewards net READY and coverage rather than candidate inflation',()=>{
 assert.deepEqual(allocateArms(),{exploit:35,explore:15});assert.throws(()=>allocateArms(1000),/bounded/);
 assert.ok(armScore({source_requests_observed:20,net_new_ready:10,new_organisers:3,new_venue_strings:4})>armScore({source_requests_observed:20,net_new_ready:0,candidates:10000}));
 assert.ok(armScore({source_requests_observed:20,net_new_ready:10,duplicates:20,candidates:20,blocked:10})<armScore({source_requests_observed:20,net_new_ready:10}));
 assert.equal(failureBucket(['verified_country_outside_operator_scope']),'out_of_market');assert.equal(failureBucket(['single_event_source_data_missing']),'source_extraction_or_event_identity');
});
test('measured winners receive exploitation and repeatedly checked zero-yield arms pause',()=>{
 const arms=[{arm:'noisy',checked:20,candidates:1000,source_requests_observed:20,net_new_ready:0},{arm:'useful',checked:20,candidates:20,source_requests_observed:20,net_new_ready:10}];
 const ranking=rankArms([{arms},{arms}]);assert.equal(ranking[0].arm,'useful');assert.equal(ranking[0].net_new_ready,20);assert.equal(ranking.find(r=>r.arm==='noisy').paused,true);
});
test('experiment custody replays identically and cannot silently replace a result',async t=>{
 const db=database(t),r={document_kind:'us_source_experiment',experiment_id:'experiment-one',phase:'completed',recorded_at:NOW,net_new_ready:10};
 const first=await recordExperiment(db,r);assert.equal(first.replay,false);assert.equal((await recordExperiment(db,r)).replay,true);
 await assert.rejects(recordExperiment(db,{...r,net_new_ready:100}),/conflicting_replay/);
 await assert.rejects(sql(db,'UPDATE source_documents SET document_json=? WHERE id=?','{}',first.id).run(),/immutable/);
 assert.equal((await sql(db,'SELECT COUNT(*) n FROM entities').first()).n,0);
});
test('robots longest-match rules, explicit agent, wildcard and refusal remain conservative',async()=>{
 const u='https://official.example.org/vendor/apply';assert.equal(robotsPermits('User-agent: *\nDisallow: /vendor/',u),false);
 assert.equal(robotsPermits('User-agent: *\nDisallow: /vendor/\nAllow: /vendor/apply$',u),true);
 assert.equal(robotsPermits('User-agent: *\nDisallow: /*apply$',u),false);
 assert.equal(robotsPermits('User-agent: FindPitches\nDisallow: /\nUser-agent: *\nAllow: /',u),false);
 assert.equal(robotsPermits('<html>Challenge</html>',u),false);
 for(const status of [401,403,429,503])assert.equal((await publicRobotsAllowed(u,{fetcher:async()=>new Response('',{status})})).allowed,false);
 assert.equal((await publicRobotsAllowed(u,{fetcher:async()=>new Response('',{status:404})})).allowed,true);
});
test('operator hop one returns real platform links without facts or footer discovery',()=>{
 const r=operatorPageLinks({url:'https://organiser.example.org/calendar',html:'<body><nav><a href="https://www.eventeny.com/events/vendor/?id=1">Apply</a></nav><main><a href="https://www.eventeny.com/events/future-fair-123/">Fair</a><a href="https://www.eventeny.com/events/vendor/?id=2">Vendors</a></main><footer><a href="https://www.eventeny.com/events/vendor/?id=3">Other</a></footer></body>'});
 assert.equal(r.length,2);assert.ok(r.every(x=>!x.country&&!x.event_start&&!x.application_state));assert.equal(r.some(x=>x.identity==='eventeny:vendor:1'),false);
});
test('venue and state capture use the exact Event address, never a query or a city named Washington',()=>{
 const d=documentFixture(),report=verifyDocument(d,{now:NOW});assert.equal(report.venue_address.state,'TX');assert.equal(report.facts.region_code,'TX');
 const event=JSON.parse(d.html.match(/<script[^>]*>(.*?)<\/script>/)[1]);event.location.address.addressLocality='Washington';event.location.address.addressRegion='Pennsylvania';const label=[event.location.name,...['streetAddress','addressLocality','addressRegion'].map(k=>event.location.address[k])].join(', ');
 assert.equal(sourceVenueAddress([event],{country:'US',location:label}).state,'PA');assert.equal(sourceUSState('Pennsylvania Avenue'),null);assert.equal(sourceUSState('Washington Street'),null);
 assert.equal(sourceVenueAddress([event],{country:'CA',location:label}),null);assert.equal(sourceVenueAddress([event],{country:'US',location:'Another venue'}),null);
});
test('an explicit source deadline time survives until its real closing instant without extending the 24-hour source clock',async t=>{
 const db=database(t),{entity}=await seed(db,record(),{environment:'shadow'}),now='2026-10-06T12:00:00.000Z',doc=documentFixture();doc.html=doc.html.replace('2026-11-20T23:59:00Z','2026-10-06T18:00:00Z');
 const proof=await recordVerification(db,entity.id,doc,{now});assert.equal(proof.report.application_close_at,'2026-10-06T18:00:00.000Z');const row=await sql(db,'SELECT checked_at,expires_at FROM source_verifications WHERE id=?',proof.verification_id).first();
 assert.equal(row.checked_at,now);assert.equal(row.expires_at,'2026-10-06T18:00:00.000Z');assert.ok(verifyDocument(doc,{now:'2026-10-06T18:00:00.000Z'}).reasons.includes('application_deadline_passed'));
});
