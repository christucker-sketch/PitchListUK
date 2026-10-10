import {customerError} from './customer-security.mjs';

export const mailCredentialIsProxyReference=value=>typeof value==='string'&&/__.*SECRET/i.test(value);

export function verifiedMailDomains(data) {
  const verified=o=>o.verified===true||o.verified===1||o.verified==='true'||o.status==='verified'||o.verification_status==='verified';
  return (data?.domains??data?.sender_domains??[]).map(d=>d.domain&&typeof d.domain==='object'
    ?{name:d.domain.fulldomain,verified:d.domain.dkim_verified===true&&d.domain.rpath_verified===true}
    :{name:d.domain??d.domain_name,verified:verified(d)})
    .filter(d=>d.verified&&typeof d.name==='string').map(d=>d.name.toLowerCase());
}

// Operator-only provider read. No sender creation, message or credential output.
export async function verifyNativeMailSettings(env,{fetcher=fetch}={}) {
  if(!env.V3_EMAIL_API_KEY||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.V3_EMAIL_FROM??''))throw customerError('service_unavailable',503);
  if(mailCredentialIsProxyReference(env.V3_EMAIL_API_KEY)){const error=customerError('service_unavailable',503);error.mailDiagnostic='proxy_reference_is_not_worker_credential';throw error;}
  const response=await fetcher('https://api.smtp2go.com/v3/domain/view',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({api_key:env.V3_EMAIL_API_KEY}),signal:AbortSignal.timeout(20000)});
  const result=await response.json();
  if(!response.ok||result.data?.error||result.data?.error_code||!Array.isArray(result.data?.domains??result.data?.sender_domains)){
    const error=customerError('service_unavailable',503),code=String(result.data?.error_code??'').toUpperCase();
    error.mailDiagnostic=code.includes('PERMISSION')?'provider_permission_denied':code.includes('API_KEY')||code.includes('APIKEY')?'provider_key_rejected':'provider_response_rejected';throw error;
  }
  const sender=env.V3_EMAIL_FROM.toLowerCase();
  return {provider:'smtp2go',sender,credential_validated:true,sender_domain_verified:verifiedMailDomains(result.data).includes(sender.split('@')[1]),emails_sent:0};
}
