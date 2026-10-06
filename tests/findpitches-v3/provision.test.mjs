import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { provision } from '../../operations/findpitches-v3/provision.mjs';
import { readCredentials } from '../../operations/findpitches-v3/cloudflare-api.mjs';
test('resource inventory refuses unknown existing names before any mutation',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'v3-provision-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));let mutations=0;
  const client={account:'a'.repeat(32),request:async()=>({status:'active'}),accountRequest:async(endpoint,options)=>{
    if(options?.method==='POST')mutations++;
    if(endpoint.includes('/d1/'))return [{name:'findpitches-v3-shadow',uuid:'unknown'}];
    return [];
  }};
  await assert.rejects(provision({stateDirectory:directory,client,apply:true}),/ownership_review/);assert.equal(mutations,0);
});
test('new-only resource provisioning is resumable, keeps publication unbound and leaves credentials out of configs',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'v3-provision-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));let database=null,queues=[],mutations=0;
  const client={account:'a'.repeat(32),request:async()=>({status:'active'}),accountRequest:async(endpoint,options)=>{
    if(options?.method==='POST'){mutations++;if(endpoint==='/d1/database'){database={name:options.body.name,uuid:'new-v3-id'};return database;}const q={queue_name:options.body.queue_name,queue_id:'id-'+options.body.queue_name};queues.push(q);return q;}
    if(endpoint.startsWith('/d1/'))return database?[database]:[];
    if(endpoint.startsWith('/queues'))return queues;
    return [];
  }};
  assert.equal((await provision({stateDirectory:directory,client})).new_queues.length,8);assert.equal(mutations,0);
  await provision({stateDirectory:directory,client,apply:true});assert.equal(mutations,9);
  await provision({stateDirectory:directory,client,apply:true});assert.equal(mutations,9);
  for(const role of ['ingest','reconcile','eligibility','enrichment','readiness','acquisition','watch','api']) {
    const config=JSON.parse(fs.readFileSync(path.join(directory,role+'.jsonc'),'utf8'));assert.equal(config.d1_databases[0].database_id,'new-v3-id');assert.equal(config.vars.V3_CITY_ENABLED,'false');assert.ok(!JSON.stringify(config.queues??{}).includes('publication'));
  }
});
test('credential files are parsed as literal data; shell instructions are not evaluated',t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'v3-credentials-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));const file=path.join(directory,'input.env');
  fs.writeFileSync(file,'CLOUDFLARE_API_TOKEN=synthetic_token_for_validation_only\nCLOUDFLARE_ACCOUNT_ID='+ 'a'.repeat(32)+'\nUNTRUSTED_COMMAND=never_execute\n');
  assert.equal(Object.keys(readCredentials(file)).length,2);
  fs.writeFileSync(file,'CLOUDFLARE_API_TOKEN=$(never_execute)\nCLOUDFLARE_ACCOUNT_ID='+ 'a'.repeat(32));assert.throws(()=>readCredentials(file),/invalid_cloudflare_token/);
});
