// Aggregate-only, read-only inspection of the confirmed live UK Pages registry.
// No import, provider mutation, email/token reads, customer export or legacy write.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {readCredentials,proxyFetch} from './cloudflare-api.mjs';

export async function auditSubscriberCoverage({credentialsFile,outputFile}) {
  const credentials=readCredentials(credentialsFile),fetcher=proxyFetch(),account=credentials.CLOUDFLARE_ACCOUNT_ID;
  const started=new Date().toISOString();let reads=0;
  const get=async route=>{
    if(!/^\/pages\/projects\/pitchlistuk$|^\/storage\/kv\/namespaces\/[a-f0-9]{32}\/(keys\?|values\/)/.test(route))throw Error('read_only_registry_route_required');
    reads++;const r=await fetcher('https://api.cloudflare.com/client/v4/accounts/'+account+route,{headers:{Authorization:'Bearer '+credentials.CLOUDFLARE_API_TOKEN},signal:AbortSignal.timeout(30000)});
    if(r.status===404)return null;if(!r.ok)throw Error('legacy_read_http_'+r.status);return r.json();
  };
  const project=(await get('/pages/projects/pitchlistuk')).result;
  const namespace=project?.deployment_configs?.production?.kv_namespaces?.PITCHLIST_ACCESS_KV?.namespace_id;
  if(project?.name!=='pitchlistuk'||namespace!=='58a00aa2b7a34071ba9de8783810d92e')throw Error('confirmed_live_uk_registry_required');
  const keys=[];let cursor=null;const seen=new Set();
  for(let page=0;page<10;page++){
    const q=new URLSearchParams({prefix:'stripe:subscription:',limit:'1000'});if(cursor)q.set('cursor',cursor);
    const response=await get('/storage/kv/namespaces/'+namespace+'/keys?'+q);
    if(!response?.success||response.result.some(k=>!/^stripe:subscription:sub_[A-Za-z0-9]+$/.test(k.name)))throw Error('canonical_subscription_keys_required');
    keys.push(...response.result.map(k=>k.name));cursor=response.result_info?.cursor;if(!cursor)break;if(seen.has(cursor))throw Error('legacy_cursor_loop');seen.add(cursor);
  }
  if(cursor)throw Error('legacy_registry_not_fully_paged');
  const value=key=>get('/storage/kv/namespaces/'+namespace+'/values/'+encodeURIComponent(key));
  const rows=[];
  for(let start=0;start<keys.length;start+=4){
    const group=await Promise.all(keys.slice(start,start+4).map(async key=>{
      const row=await value(key);if(!row||typeof row!=='object'||Array.isArray(row))return {invalid:true};
      const customer=/^cus_[A-Za-z0-9]+$/.test(row.customer??'')?row.customer:null,subscription=key.slice('stripe:subscription:'.length),email=typeof row.email==='string'?row.email.trim().toLowerCase():null;
      const safe={customer,subscription,email,status:String(row.status??'unknown').toLowerCase(),access:row.access,period_end:row.current_period_end,cancel_at_period_end:Boolean(row.cancel_at_period_end),key_binding_valid:row.subscription===subscription,mode_present:typeof row.livemode==='boolean',product_present:Boolean(row.product),price_present:Boolean(row.price_id??row.price)};
      if(customer&&email&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
        const [c,e,v]=await Promise.all([value('stripe:customer:'+customer),value('stripe:email:'+email),value('vendor:email:'+email)]);
        safe.customer_index_match=c?.customer===customer&&c?.subscription===subscription&&c?.email?.toLowerCase()===email;
        safe.email_index_match=e?.customer===customer&&e?.subscription===subscription&&e?.email?.toLowerCase()===email;
        if(v?.vendor_id&&/^[A-Za-z0-9_-]{1,120}$/.test(v.vendor_id)){
          const profile=await value('vendor:'+v.vendor_id);safe.vendor_profile_found=Boolean(profile);
          safe.vendor_binding_exact=profile?.vendor_id===v.vendor_id&&profile?.private_account?.email?.toLowerCase()===email&&profile?.private_account?.stripe_customer_id===customer&&profile?.private_account?.stripe_subscription_id===subscription;
        }
      }
      return safe;
    }));rows.push(...group);
  }
  const valid=rows.filter(r=>!r.invalid),reportedCurrent=valid.filter(r=>['active','trialing'].includes(r.status)&&r.access==='allowed');
  const counts=key=>Object.fromEntries([...new Set(valid.map(r=>r[key]))].map(v=>[v,valid.filter(r=>r[key]===v).length]));
  const grouped=(items,key)=>{const m=new Map();for(const r of items)if(r[key])m.set(r[key],(m.get(r[key])??0)+1);return [...m.values()].filter(n=>n>1).length;};
  const projectAfter=(await get('/pages/projects/pitchlistuk')).result;
  const report={schema:'findpitches-v3-subscriber-coverage-v1',started_at:started,as_of:new Date().toISOString(),source:'confirmed_live_uk_pitchlistuk_production_access_registry',read_only:true,non_atomic_snapshot:true,canonical_registry_rows:keys.length,invalid_records:rows.filter(r=>r.invalid).length,status_counts:counts('status'),distinct_registry_customers:new Set(valid.map(r=>r.customer).filter(Boolean)).size,distinct_registry_emails:new Set(valid.map(r=>r.email).filter(Boolean)).size,
    registry_reported_current_access:reportedCurrent.length,verified_live_subscribers:null,provider_canonical_checks:0,
    ownership:{subscription_key_binding_valid:valid.filter(r=>r.key_binding_valid).length,missing_customer_or_email:valid.filter(r=>!r.customer||!r.email).length,customer_index_matches:valid.filter(r=>r.customer_index_match).length,email_index_matches:valid.filter(r=>r.email_index_match).length,vendor_profiles_found:valid.filter(r=>r.vendor_profile_found).length,exact_vendor_customer_subscription_bindings:valid.filter(r=>r.vendor_binding_exact).length,current_rows_without_exact_vendor_binding:reportedCurrent.filter(r=>!r.vendor_binding_exact).length,multiple_subscription_rows_per_customer:grouped(valid,'customer'),multiple_current_subscriptions_per_customer:grouped(reportedCurrent,'customer'),multiple_current_subscriptions_per_email:grouped(reportedCurrent,'email')},
    entitlement_cases:{registry_trialing:valid.filter(r=>r.status==='trialing').length,registry_active:valid.filter(r=>r.status==='active').length,current_scheduled_cancellations:reportedCurrent.filter(r=>r.cancel_at_period_end).length,ended_canceled:valid.filter(r=>r.status==='canceled').length,payment_problem:valid.filter(r=>['past_due','unpaid','incomplete','paused'].includes(r.status)).length,missing_or_invalid_period_end:valid.filter(r=>!Number.isFinite(Number(r.period_end))||Number(r.period_end)<=0).length,reported_current_with_past_period_end:reportedCurrent.filter(r=>Number(r.period_end)>0&&Number(r.period_end)*1000<=Date.now()).length},
    missing_provider_coverage:{mode_not_retained:valid.filter(r=>!r.mode_present).length,product_not_retained:valid.filter(r=>!r.product_present).length,price_not_retained:valid.filter(r=>!r.price_present).length,rows_requiring_canonical_provider_check:valid.length,real_customer_recognition_enabled:false},
    provider_key_requirement:'appropriate existing read-only canonical provider access; do not use TEST credentials to infer live subscription state',http_get_requests:reads,legacy_writes:0,native_customer_imports:0,provider_writes:0,messages_sent:0,serper_queries:0,live_deployment_unchanged:project.canonical_deployment?.id===projectAfter.canonical_deployment?.id};
  if(!report.live_deployment_unchanged)throw Error('live_deployment_changed_during_read_only_audit');
  fs.writeFileSync(outputFile,JSON.stringify(report,null,2)+'\n');return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),get=k=>args[args.indexOf(k)+1];try{console.log(JSON.stringify(await auditSubscriberCoverage({credentialsFile:get('--credentials'),outputFile:get('--output')})));}catch(e){console.error(/^[a-z0-9_]+$/.test(e.message)?e.message:'subscriber_coverage_audit_failed');process.exitCode=1;}
}
