import test from 'node:test';import assert from 'node:assert/strict';
import {launchSettings,assertLaunchEvidence,assertOwnedRoutes} from '../../operations/findpitches-v3/launch-customer-public.mjs';
test('public launch stages retain every credential/source binding and cannot enable Checkout while opening browsing',()=>{
 const b={bindings:['V3_PUBLIC_ENABLED','V3_ACCOUNT_RECOVERY_ENABLED','V3_CHECKOUT_ENABLED'].map(name=>({name,type:'plain_text',text:'false'})).concat([{name:'V3_EMAIL_API_KEY',type:'secret_text'},{name:'STRIPE_SECRET_KEY',type:'secret_text'},{name:'V3_CUSTOMER_DB',type:'d1',id:'live-db'}])};
 const browse=launchSettings(b,'browse');assert.equal(browse.changes.V3_CHECKOUT_ENABLED,'disabled');assert.equal(browse.changes.V3_PUBLIC_ENABLED,'true');assert.equal(browse.changes.V3_ACCOUNT_RECOVERY_ENABLED,'true');assert.deepEqual(launchSettings(b,'checkout').changes,{V3_CHECKOUT_ENABLED:'live'});
 for(const n of ['V3_EMAIL_API_KEY','STRIPE_SECRET_KEY','V3_CUSTOMER_DB'])assert.deepEqual(browse.settings.bindings.find(v=>v.name===n),{name:n,type:'inherit',version_id:'latest'});assert.throws(()=>launchSettings(b,'anything'),/explicit_launch_stage_required/);
});
test('launch refuses stale, incomplete, mutated or spending/backlogged checkpoints',()=>{
 const t=new Date().toISOString(),good={schema:'findpitches-v3-live-provider-checkpoint-v1',as_of:t,validation:{full_v3:{passed:256,failed:0,skipped:0},boundaries_passed:true,frontend:{independence_passed:true}},preservation:{as_of:t,destructive_source_mutations:0,existing_identity_changes:0,live_v1_deployment_unchanged:true,v2_schedules_unchanged:true},native_validation:{as_of:t,nashville_eligible:0},source_health:{as_of:t,safety:{paid_queries_today:0,paid_bulk_enabled:0,commercial_manual_paused:1,dead_jobs:0,leased_jobs:0,due_jobs:0}}};assertLaunchEvidence(good);
 for(const patch of [r=>r.as_of='2000-01-01',r=>r.validation.full_v3.failed=1,r=>r.preservation.destructive_source_mutations=1,r=>r.native_validation.nashville_eligible=1,r=>r.source_health.safety.paid_queries_today=1,r=>r.source_health.safety.due_jobs=100,r=>r.preservation.as_of='2000-01-01']){const bad=structuredClone(good);patch(bad);assert.throws(()=>assertLaunchEvidence(bad));}
});
test('routing rejects PitchList/foreign paths, different scripts and duplicate exact routes',()=>{
 const own={pattern:'findpitches.com/*',script:'findpitches-v3-customer-production'};assertOwnedRoutes([]);assertOwnedRoutes([own,{...own,pattern:'www.findpitches.com/*'}]);
 for(const bad of [[{...own,pattern:'pitchlist.uk/*'}],[{...own,script:'pitchlistuk'}],[own,own],[{...own,pattern:'*.findpitches.com/*'}]])assert.throws(()=>assertOwnedRoutes(bad),/unexpected_findpitches_route/);
});
