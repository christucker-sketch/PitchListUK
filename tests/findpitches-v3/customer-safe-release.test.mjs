import test from 'node:test';
import assert from 'node:assert/strict';
import {customerSafeReleaseConfig} from '../../operations/findpitches-v3/release-customer-production.mjs';
function fixture(){return {state:{worker:'findpitches-v3-customer-production',database_name:'findpitches-v3-customer-production',database_id:'owned-live-db'},routes:['findpitches.com/*','www.findpitches.com/*'].map(pattern=>({pattern,script:'findpitches-v3-customer-production'})),schedules:[{cron:'*/5 * * * *'}],before:{compatibility_date:'2026-10-01',compatibility_flags:[],limits:{cpu_ms:30000},logpush:false,tail_consumers:[],tags:[],bindings:[{name:'ASSETS',type:'assets'},{name:'V3_CUSTOMER_DB',type:'d1',id:'owned-live-db'},{name:'V3_READY_API',type:'service',service:'findpitches-v3-api-shadow'},...Object.entries({V3_CUSTOMER_MODE:'production_public',V3_STRIPE_MODE:'live',V3_CHECKOUT_ENABLED:'disabled',V3_PUBLIC_ENABLED:'true',V3_ACCOUNT_RECOVERY_ENABLED:'true',V3_EMAIL_FROM:'hello@findpitches.com'}).map(([name,text])=>({name,type:'plain_text',text})),...['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','V3_EMAIL_API_KEY','V3_SESSION_SECRET','V3_PRODUCTION_OPERATOR_TOKEN','V3_STAGING_TOKEN'].map(name=>({name,type:'secret_text'}))]}};}
test('customer-safe code release preserves current public/recovery flags and refuses live Checkout or TEST/source ownership drift',()=>{
 const f=fixture(),c=customerSafeReleaseConfig(f);assert.equal(c.keep_vars,true);assert.equal(c.vars.V3_PUBLIC_ENABLED,'true');assert.equal(c.vars.V3_ACCOUNT_RECOVERY_ENABLED,'true');assert.equal(c.vars.V3_CHECKOUT_ENABLED,'disabled');assert.ok(!Object.hasOwn(c.vars,'STRIPE_SECRET_KEY'));
 for(const [name,value] of [['V3_CHECKOUT_ENABLED','live'],['V3_ACCOUNT_RECOVERY_ENABLED','false'],['V3_CUSTOMER_MODE','restricted_shadow_preview'],['V3_STRIPE_MODE','test']]){const bad=fixture();bad.before.bindings.find(b=>b.name===name).text=value;assert.throws(()=>customerSafeReleaseConfig(bad));}
 const bad=fixture();bad.before.bindings.find(b=>b.name==='V3_READY_API').service='findpitches-v2-shadow';assert.throws(()=>customerSafeReleaseConfig(bad),/owned_live_runtime_required/);
});
test('customer-safe release refuses missing mail secrets, foreign routes, changed databases and unexpected schedules',()=>{
 const missing=fixture();missing.before.bindings=missing.before.bindings.filter(b=>b.name!=='V3_EMAIL_API_KEY');assert.throws(()=>customerSafeReleaseConfig(missing),/existing_native_secrets_required/);
 const route=fixture();route.routes.push({pattern:'pitchlist.uk/*',script:route.state.worker});assert.throws(()=>customerSafeReleaseConfig(route),/unexpected_findpitches_route/);
 const db=fixture();db.before.bindings.find(b=>b.name==='V3_CUSTOMER_DB').id='preview-test-db';assert.throws(()=>customerSafeReleaseConfig(db),/owned_live_runtime_required/);
 const cron=fixture();cron.schedules=[{cron:'* * * * *'}];assert.throws(()=>customerSafeReleaseConfig(cron),/existing_customer_schedule_required/);
});
