import test from 'node:test';import assert from 'node:assert/strict';
import {openLocalD1} from '../../operations/findpitches-v3/local-d1.mjs';
import {LATEST_MARKET_DELIVERIES_SQL,marketProofSummary} from '../../operations/findpitches-v3/market-proof-report.mjs';
import {VERIFIER_VERSION} from '../../platform/findpitches-v3/verification.mjs';
const now='2026-10-17T00:00:00Z';
test('market intake uses the globally latest delivery per producer ID, excludes test and reports rejected codes without raw data',async t=>{
 const d=openLocalD1(':memory:');t.after(()=>d.close());
 const insert=d.sqlite.prepare("INSERT INTO producer_records(id,producer_name,producer_type,producer_record_id,environment,market,content_hash,raw_json,validation_status,errors_json,received_at) VALUES (?,'independent-structured','structured',?,?,?,?,'{}',?,?,?)");
 for(const r of [['a','changed','shadow','FR','a','accepted','[]','2026-10-16T00:00Z'],['b','changed','shadow','GB','b','accepted','[]','2026-10-16T01:00Z'],['c','held','shadow','FR','c','rejected','["event_name_required"]','2026-10-16T01:00Z'],['d','held','shadow','FR','d','accepted','[]','2026-10-16T02:00Z'],['e','test-only','test','FR','e','accepted','[]','2026-10-16T00:00Z']])insert.run(...r);
 const latest=(await d.prepare(LATEST_MARKET_DELIVERIES_SQL).bind('FR').all()).results;
 assert.equal(latest.length,1);assert.equal(latest[0].validation_status,'accepted');
 const out=marketProofSummary({market:'FR',now,receipts:[],latestDeliveries:[...latest,{producer_name:'independent-structured',validation_status:'rejected',errors_json:'["country_required","https://private.example.org/receipt"]'}],rows:[],customerRows:[],transport:{}});
 assert.deepEqual(out.latest_delivery_units,{'independent-structured':{accepted:1,rejected:1}});
 assert.deepEqual(out.validation_reason_counts,{country_required:1,unclassified_reason:1});assert.ok(!JSON.stringify(out).includes('private.example.org'));
});
test('concurrent snapshot differences remain explicitly accounted for, never invented producer attribution',()=>{
 const out=marketProofSummary({market:'FR',now,receipts:[],latestDeliveries:[],rows:[],customerRows:[{id:'newer-entity',market:'FR'}],transport:{}});
 assert.equal(out.state,'intake_observed');assert.equal(out.current_customer_ready,1);assert.equal(out.unattributed_ready_entities,1);assert.deepEqual(out.ready_by_origin_producer,{});
 assert.ok(!JSON.stringify(out).includes('newer-entity'));
});
test('market proof report never promotes a stale cached claim and uses the actual gated customer subset',()=>{
 const base={id:'held',market:'FR',environment:'shadow',origin:'independent-structured',revision:1,cached_readiness:'ready',readiness_revision:1,proof_revision:1,proof_sequence:1,proof_status:'verified',verifier_version:VERIFIER_VERSION,checked_at:'2020-01-01',expires_at:'2020-01-02',fields_json:'{}',proof_json:'{"status":"verified","profile":"france_council","reasons":["country_not_proved"],"facts":{}}'};
 const out=marketProofSummary({market:'FR',now,receipts:[],latestDeliveries:[],rows:[base,{...base,id:'test',environment:'test'}],customerRows:[],transport:{}});
 assert.equal(out.commercial_entities,1);assert.equal(out.excluded_test_entities,1);assert.equal(out.current_customer_ready,0);
 assert.equal(out.verification.verified,0);assert.equal(out.verification.stale_or_expired,1);assert.equal(out.held_reason_counts.country_not_proved,1);
 assert.ok(!JSON.stringify(out).includes('"held"'));assert.equal(out.source_gets,0);assert.equal(out.serper_queries,0);
});
