// Read existing SMTP2GO verification only; never create a sender or send mail.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {proxyFetch} from './cloudflare-api.mjs';
import {verifiedMailDomains,mailCredentialIsProxyReference} from '../../platform/findpitches-v3/customer-mail.mjs';
export async function configureCustomerEmail({customerDirectory,credentialFile=null,confirmedExistingSender=null,fetcher=proxyFetch()}={}) {
  let settings={SMTP2GO_API_KEY:process.env.SMTP2GO_API_KEY,V3_EMAIL_API_KEY:process.env.V3_EMAIL_API_KEY,V3_EMAIL_FROM:process.env.V3_EMAIL_FROM};
  if(credentialFile){if(!fs.existsSync(credentialFile))throw Error('secure_smtp2go_file_absent');fs.chmodSync(credentialFile,0o600);
    for(const line of fs.readFileSync(credentialFile,'utf8').split(/\r?\n/)){if(!line.trim()||line.trim().startsWith('#'))continue;const m=line.match(/^\s*(?:export\s+)?(SMTP2GO_API_KEY|V3_EMAIL_API_KEY|V3_EMAIL_FROM)\s*=\s*(.*?)\s*$/);if(!m)throw Error('mail_only_env_file_required');settings[m[1]]=m[2].replace(/^(['"])(.*)\1$/,'$2');}}
  const key=settings.SMTP2GO_API_KEY||settings.V3_EMAIL_API_KEY;if(typeof key!=='string'||!key.trim())throw Error('accessible_existing_smtp2go_key_required');
  const read=async route=>{const r=await fetcher('https://api.smtp2go.com/v3/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({api_key:key}),signal:AbortSignal.timeout(30000)}),d=await r.json();
    if(!r.ok||d.data?.error||d.data?.error_code)throw Error(d.data?.error_code==='E_ApiResponseCodes.ENDPOINT_PERMISSION_DENIED'?'smtp2go_configuration_read_permission_denied':'smtp2go_verification_read_failed');return d.data;};
  const [domainResult,senderResult]=await Promise.allSettled([read('domain/view'),read('single_sender_emails/view')]);
  const domainData=domainResult.status==='fulfilled'?domainResult.value:null,senderData=senderResult.status==='fulfilled'?senderResult.value:null;
  // Existing sending keys may intentionally lack account-configuration access.
  // An explicit operator-confirmed sender allows binding, never a verified claim.
  // Authentication errors, transport failures or contradictory readable account
  // data cannot be bypassed through this narrow path.
  const readsDenied=[domainResult,senderResult].every(r=>r.status==='rejected'&&r.reason?.message==='smtp2go_configuration_read_permission_denied');
  const confirmed=Boolean(readsDenied&&confirmedExistingSender&&confirmedExistingSender===settings.V3_EMAIL_FROM);
  if(!domainData&&!senderData&&!confirmed)throw Error('smtp2go_verified_sender_read_unavailable');
  const verified=o=>o.verified===true||o.verified===1||o.verified==='true'||o.status==='verified'||o.verification_status==='verified';
  const senderRows=senderData?.senders??senderData?.emails??senderData?.single_sender_emails??[];
  const domains=new Set(verifiedMailDomains(domainData));
  const senders=senderRows.filter(verified).map(s=>String(s.email_address??s.email??s.sender_address??s.address??'').toLowerCase());
  const branded=senders.filter(s=>/@(?:findpitches\.com|pitchlist\.uk)$/.test(s));
  const sender=settings.V3_EMAIL_FROM?.toLowerCase()??(branded.length===1?branded[0]:null);
  const senderVerified=Boolean(sender&&(senders.includes(sender)||domains.has(sender.split('@')[1])));
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender??'')||!senderVerified&&!confirmed)throw Error('existing_verified_sender_required');
  fs.mkdirSync(customerDirectory,{recursive:true,mode:0o700});
  const proxyOnly=mailCredentialIsProxyReference(key);
  if(!proxyOnly)fs.writeFileSync(path.join(customerDirectory,'mail-private.json'),JSON.stringify({V3_EMAIL_API_KEY:key,V3_EMAIL_FROM:sender}),{mode:0o600});
  else fs.writeFileSync(path.join(customerDirectory,'mail-pending.json'),JSON.stringify({V3_EMAIL_FROM:sender,provider_sender_verified:senderVerified,raw_worker_secret_required:true}),{mode:0o600});
  const report={schema:'findpitches-v3-existing-mail-verification-v2',as_of:new Date().toISOString(),existing_account_reused:true,sender,sender_verified:senderVerified,
    verification:senderVerified?(senders.includes(sender)?'existing_single_sender':'existing_verified_domain'):'operator_confirmed_existing_sender',
    provider_configuration_read_access:!readsDenied,provider_verification_pending:!senderVerified,worker_binding_ready:!proxyOnly,credential_transport:proxyOnly?'environment_proxy':'raw_secure_credential',
    configuration_reads:Object.fromEntries([['domain/view',domainResult],['single_sender_emails/view',senderResult]].map(([route,r])=>[route,r.status==='fulfilled'?'available':r.reason?.message==='smtp2go_configuration_read_permission_denied'?'permission_denied':'failed'])),
    new_senders_created:0,emails_sent:0,native_delivery_tested:false};
  fs.writeFileSync(path.join(customerDirectory,'mail-report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const a=process.argv.slice(2),get=k=>a[a.indexOf(k)+1];try{console.log(JSON.stringify(await configureCustomerEmail({customerDirectory:get('--customer-dir'),credentialFile:a.includes('--credential-file')?get('--credential-file'):null,confirmedExistingSender:a.includes('--confirmed-existing-sender')?get('--confirmed-existing-sender'):null})));}catch(e){console.error(/^[a-z0-9_]+$/.test(e.message)?e.message:'existing_mail_configuration_failed');process.exitCode=1;}}
