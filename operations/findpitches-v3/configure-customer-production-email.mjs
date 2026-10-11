// Reuse the existing verified account/sender. No sender or domain creation.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {cloudflareClient,readCredentials,proxyFetch} from './cloudflare-api.mjs';
import {secureProductionSettings} from './configure-customer-production-stripe.mjs';
import {verifyNativeMailSettings,mailCredentialIsProxyReference} from '../../platform/findpitches-v3/customer-mail.mjs';
export async function configureProductionEmail({credentialsFile,secureFile,productionDirectory,fetcher=proxyFetch()}){
 const state=JSON.parse(fs.readFileSync(path.join(productionDirectory,'resources.json'))),cf=cloudflareClient(readCredentials(credentialsFile)),values=secureProductionSettings(secureFile),key=values.V3_EMAIL_API_KEY??values.SMTP2GO_API_KEY;
 if(state.account_id!==cf.account||state.worker!=='findpitches-v3-customer-production')throw Error('owned_production_required');
 if(!key||mailCredentialIsProxyReference(key))throw Error('raw_existing_smtp2go_key_required');
 const env={V3_EMAIL_API_KEY:key,V3_EMAIL_FROM:'hello@findpitches.com'},verified=await verifyNativeMailSettings(env,{fetcher});if(!verified.sender_domain_verified)throw Error('existing_sender_verification_required');
 const settings=await cf.accountRequest('/workers/scripts/'+state.worker+'/settings');if(settings.bindings.find(b=>b.name==='V3_CUSTOMER_DB')?.id!==state.database_id||settings.bindings.find(b=>b.name==='V3_EMAIL_FROM')?.text!==env.V3_EMAIL_FROM)throw Error('owned_mail_binding_required');
 await cf.accountRequest('/workers/scripts/'+state.worker+'/secrets',{method:'PUT',body:{name:'V3_EMAIL_API_KEY',type:'secret_text',text:key}});
 fs.writeFileSync(path.join(productionDirectory,'mail-private.json'),JSON.stringify({...env,verified:true,verified_at:new Date().toISOString()})+'\n',{mode:0o600});
 return {...verified,worker:state.worker,native_secret_written:true,emails_sent:0,new_sender_created:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const args=process.argv.slice(2),get=k=>args[args.indexOf(k)+1];try{console.log(JSON.stringify(await configureProductionEmail({credentialsFile:get('--credentials'),secureFile:get('--secure-env'),productionDirectory:get('--production-dir')})));}catch{console.error('production_mail_configuration_failed');process.exitCode=1;}}
