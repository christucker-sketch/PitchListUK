import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {LEGACY_STOP_FLAGS,stopSettings,assertStopPreserved} from '../../operations/findpitches-v3/legacy-paid-safety.mjs';
const before=()=>({bindings:[...LEGACY_STOP_FLAGS.map(name=>({name,type:'plain_text',text:'true'})),{name:'SERPER_API_KEY',type:'secret_text'},{name:'UK_CONTROLLER_STATE',type:'durable_object_namespace',namespace_id:'original-state'}],logpush:false});
test('legacy spend stop inherits secrets/state and changes only the named stop flags',()=>{
  const initial=before(),patch=stopSettings(initial,'latest');
  assert.deepEqual(patch.bindings.filter(b=>LEGACY_STOP_FLAGS.includes(b.name)).map(b=>b.text),['false','false','false','false']);
  assert.deepEqual(patch.bindings.find(b=>b.name==='SERPER_API_KEY'),{name:'SERPER_API_KEY',type:'inherit',version_id:'latest'});
  assert.equal(initial.bindings[0].text,'true');
  const after={...initial,bindings:initial.bindings.map(b=>LEGACY_STOP_FLAGS.includes(b.name)?{...b,text:'false'}:b)};
  assert.doesNotThrow(()=>assertStopPreserved(initial,after));
  assert.throws(()=>assertStopPreserved(initial,{...after,logpush:true}),/unrelated_legacy_setting_changed/);
  assert.throws(()=>assertStopPreserved(initial,{...after,bindings:after.bindings.map(b=>b.name==='UK_CONTROLLER_STATE'?{...b,namespace_id:'new-state'}:b)}),/unrelated_legacy_binding_changed/);
  assert.throws(()=>stopSettings({bindings:[]},'latest'),/binding_missing/);
});
test('checked-in legacy configuration cannot reactivate the stopped paid controllers on redeploy',()=>{
  const config=JSON.parse(fs.readFileSync(new URL('../../operations/cloudflare-global-acquisition/wrangler.jsonc',import.meta.url),'utf8'));
  assert.ok(LEGACY_STOP_FLAGS.every(name=>config.vars[name]==='false'));
  const workflow=fs.readFileSync(new URL('../../.github/workflows/global-acquisition-shadow.yml',import.meta.url),'utf8');
  assert.match(workflow,/deploy_and_prove:\s*(?:#[^\n]*\n\s*)*if: \$\{\{ false \}\}/);
});
