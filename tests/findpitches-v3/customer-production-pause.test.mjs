import test from 'node:test';import assert from 'node:assert/strict';
import {recoverySettings,assertRecoveryPreserved} from '../../operations/findpitches-v3/pause-customer-production.mjs';
const before=()=>({compatibility_date:'2026-10-01',annotations:{original:'retained'},bindings:[{name:'V3_CHECKOUT_ENABLED',type:'plain_text',text:'live'},{name:'V3_PUBLIC_ENABLED',type:'plain_text',text:'true'},{name:'V3_ACCOUNT_RECOVERY_ENABLED',type:'plain_text',text:'false'},{name:'V3_CUSTOMER_DB',type:'d1',id:'live-isolated'},{name:'STRIPE_SECRET_KEY',type:'secret_text'},{name:'STRIPE_WEBHOOK_SECRET',type:'secret_text'},{name:'V3_EMAIL_API_KEY',type:'secret_text'},{name:'V3_READY_API',type:'service',service:'findpitches-v3-api-shadow'}]});
test('rollback settings can only close acquisition/checkout and preserve every native binding by inheritance',()=>{
 const b=before(),changes={V3_PUBLIC_ENABLED:'false',V3_ACCOUNT_RECOVERY_ENABLED:'true'},patch=recoverySettings(b,changes);
 assert.equal(patch.bindings.find(v=>v.name==='V3_PUBLIC_ENABLED').text,'false');for(const binding of b.bindings.filter(v=>!Object.hasOwn(changes,v.name)))assert.deepEqual(patch.bindings.find(v=>v.name===binding.name),{name:binding.name,type:'inherit',version_id:'latest'});
 for(const unsafe of [{STRIPE_SECRET_KEY:'replace'},{V3_CHECKOUT_ENABLED:'live'},{V3_PUBLIC_ENABLED:'true'},{V3_ACCOUNT_RECOVERY_ENABLED:'false'}])assert.throws(()=>recoverySettings(b,unsafe),/close_only_flags_required/);
});
test('rollback verification rejects losing LIVE mail/keys/database or altering unrelated Worker settings',()=>{
 const b=before(),changes={V3_CHECKOUT_ENABLED:'disabled'},good=structuredClone(b);good.bindings[0].text='disabled';assertRecoveryPreserved(b,good,changes);
 for(const name of ['V3_CUSTOMER_DB','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','V3_EMAIL_API_KEY','V3_READY_API']){const bad=structuredClone(good);bad.bindings=bad.bindings.filter(v=>v.name!==name);assert.throws(()=>assertRecoveryPreserved(b,bad,changes),/binding_count_changed/);}
 const bad=structuredClone(good);bad.bindings.find(v=>v.name==='V3_CUSTOMER_DB').id='test-db';assert.throws(()=>assertRecoveryPreserved(b,bad,changes),/unrelated_production_binding_changed/);
 assert.throws(()=>assertRecoveryPreserved(b,{...good,compatibility_date:'changed'},changes),/unrelated_production_setting_changed/);
});
