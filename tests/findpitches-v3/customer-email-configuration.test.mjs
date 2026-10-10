import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {configureCustomerEmail} from '../../operations/findpitches-v3/configure-customer-email.mjs';

function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fp-v3-mail-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const credentialFile=path.join(root,'mail.env'),customerDirectory=path.join(root,'customer');
  fs.writeFileSync(credentialFile,'SMTP2GO_API_KEY=mail_configuration_fixture\nV3_EMAIL_FROM=login@sender.example.org\n',{mode:0o600});
  return {credentialFile,customerDirectory};
}
const denied=()=>Response.json({data:{error_code:'E_ApiResponseCodes.ENDPOINT_PERMISSION_DENIED',error:'Configuration read not permitted'}},{status:400});

test('existing verified domain configures mail without creating senders or sending messages',async t=>{
  const f=fixture(t),routes=[];
  const report=await configureCustomerEmail({...f,fetcher:async(url,options)=>{
    routes.push(new URL(url).pathname);assert.equal(JSON.parse(options.body).api_key,'mail_configuration_fixture');
    return Response.json({data:url.endsWith('domain/view')?{domains:[{domain:'sender.example.org',verified:true}]}:{senders:[]}});
  }});
  assert.equal(report.sender_verified,true);assert.equal(report.verification,'existing_verified_domain');
  assert.deepEqual(routes.sort(),['/v3/domain/view','/v3/single_sender_emails/view']);assert.equal(report.emails_sent,0);
  assert.equal(fs.statSync(path.join(f.customerDirectory,'mail-private.json')).mode&0o777,0o600);
  assert.ok(!JSON.stringify(report).includes('mail_configuration_fixture'));
});
test('configuration-restricted key requires exact operator confirmation and never claims verification',async t=>{
  const f=fixture(t);
  await assert.rejects(configureCustomerEmail({...f,fetcher:async()=>denied()}),/verified_sender_read_unavailable/);
  await assert.rejects(configureCustomerEmail({...f,confirmedExistingSender:'other@sender.example.org',fetcher:async()=>denied()}),/verified_sender_read_unavailable/);
  assert.equal(fs.existsSync(path.join(f.customerDirectory,'mail-private.json')),false);
  const report=await configureCustomerEmail({...f,confirmedExistingSender:'login@sender.example.org',fetcher:async()=>denied()});
  assert.equal(report.sender_verified,false);assert.equal(report.provider_configuration_read_access,false);
  assert.equal(report.provider_verification_pending,true);assert.equal(report.native_delivery_tested,false);assert.equal(report.emails_sent,0);
});
test('SMTP2GO nested domain proof requires both DKIM and return-path verification',async t=>{
  const f=fixture(t);let rpathVerified=false;
  const fetcher=async url=>url.endsWith('domain/view')?Response.json({data:{domains:[{domain:{fulldomain:'sender.example.org',dkim_verified:true,rpath_verified:rpathVerified}}]}}):denied();
  await assert.rejects(configureCustomerEmail({...f,fetcher}),/existing_verified_sender_required/);
  rpathVerified=true;
  const report=await configureCustomerEmail({...f,fetcher});
  assert.equal(report.sender_verified,true);assert.equal(report.provider_verification_pending,false);
  assert.equal(report.verification,'existing_verified_domain');
  assert.deepEqual(report.configuration_reads,{'domain/view':'available','single_sender_emails/view':'permission_denied'});
});
test('operator confirmation cannot bypass authentication or transport errors',async t=>{
  const f=fixture(t),opts={...f,confirmedExistingSender:'login@sender.example.org'};
  await assert.rejects(configureCustomerEmail({...opts,fetcher:async()=>Response.json({data:{error_code:'INVALID_API_KEY'}},{status:401})}),/verified_sender_read_unavailable/);
  await assert.rejects(configureCustomerEmail({...opts,fetcher:async()=>{throw Error('network_failure');}}),/verified_sender_read_unavailable/);
  assert.equal(fs.existsSync(path.join(f.customerDirectory,'mail-private.json')),false);
});
test('readable negative sender evidence cannot be bypassed by operator confirmation',async t=>{
  const f=fixture(t);
  await assert.rejects(configureCustomerEmail({...f,confirmedExistingSender:'login@sender.example.org',fetcher:async url=>url.endsWith('domain/view')?Response.json({data:{domains:[{domain:'sender.example.org',verified:false}]}}):denied()}),/existing_verified_sender_required/);
  assert.equal(fs.existsSync(path.join(f.customerDirectory,'mail-private.json')),false);
});
test('environment proxy keys verify the provider but never create a deployable raw-key file',async t=>{
  const f=fixture(t);fs.writeFileSync(f.credentialFile,'SMTP2GO_API_KEY=__SECRET_FIXTURE_REFERENCE__\nV3_EMAIL_FROM=login@sender.example.org\n');
  const report=await configureCustomerEmail({...f,fetcher:async()=>Response.json({data:{domains:[{domain:{fulldomain:'sender.example.org',dkim_verified:true,rpath_verified:true}}]}})});
  assert.equal(report.sender_verified,true);assert.equal(report.worker_binding_ready,false);assert.equal(report.credential_transport,'environment_proxy');
  assert.equal(fs.existsSync(path.join(f.customerDirectory,'mail-private.json')),false);assert.equal(fs.existsSync(path.join(f.customerDirectory,'mail-pending.json')),true);
});
