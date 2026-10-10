import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyNativeMailSettings,verifiedMailDomains} from '../../platform/findpitches-v3/customer-mail.mjs';
import worker from '../../platform/findpitches-v3/customer-worker.mjs';
const env={V3_EMAIL_API_KEY:'native_mail_fixture',V3_EMAIL_FROM:'login@sender.example.org'};

test('native provider verification validates its own credential without messages or secret output',async()=>{
  const report=await verifyNativeMailSettings(env,{fetcher:async(url,options)=>{
    assert.equal(url,'https://api.smtp2go.com/v3/domain/view');assert.deepEqual(JSON.parse(options.body),{api_key:env.V3_EMAIL_API_KEY});
    return Response.json({data:{domains:[{domain:{fulldomain:'sender.example.org',dkim_verified:true,rpath_verified:true}}]}});
  }});
  assert.equal(report.credential_validated,true);assert.equal(report.sender_domain_verified,true);assert.equal(report.emails_sent,0);
  assert.ok(!JSON.stringify(report).includes(env.V3_EMAIL_API_KEY));
  assert.deepEqual(verifiedMailDomains({domains:[{domain:{fulldomain:'sender.example.org',dkim_verified:true,rpath_verified:false}}]}),[]);
});
test('native provider errors cannot become positive credential or sender verification',async()=>{
  await assert.rejects(verifyNativeMailSettings({}, {fetcher:()=>{throw Error('must_not_fetch');}}),/service_unavailable/);
  for(const response of [Response.json({data:{error_code:'INVALID_API_KEY'}},{status:401}),Response.json({data:{}})])
    await assert.rejects(verifyNativeMailSettings(env,{fetcher:async()=>response}),/service_unavailable/);
  const report=await verifyNativeMailSettings(env,{fetcher:async()=>Response.json({data:{domains:[{domain:{fulldomain:'different.example.org',dkim_verified:true,rpath_verified:true}}]}})});
  assert.equal(report.sender_domain_verified,false);
});
test('proxy references cannot become native sending credentials',async()=>{
  await assert.rejects(verifyNativeMailSettings({...env,V3_EMAIL_API_KEY:'__SECRET_FIXTURE_REFERENCE__'},{fetcher:()=>{throw Error('must_not_fetch');}}),e=>e.mailDiagnostic==='proxy_reference_is_not_worker_credential');
});
test('native mail configuration check requires operator access',async()=>{
  const response=await worker.fetch(new Request('https://preview.example.org/preview/email/verify',{method:'POST'}),{V3_CUSTOMER_MODE:'restricted_shadow_preview',V3_CUSTOMER_DB:{},V3_PREVIEW_OPERATOR_TOKEN:'operator_fixture'});
  assert.equal(response.status,403);
});
