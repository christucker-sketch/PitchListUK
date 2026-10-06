import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// Parse values as data. Uploaded credential files are never sourced or evaluated.
export function readCredentials(file) {
  const source=fs.readFileSync(file,'utf8'),values={};
  for(const line of source.split(/\r?\n/)) {
    const match=line.match(/^\s*(?:export\s+)?(CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID)\s*=\s*(.*?)\s*$/);
    if(!match)continue;
    let value=match[2];if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);
    values[match[1]]=value;
  }
  if(!/^[a-zA-Z0-9_-]{20,200}$/.test(values.CLOUDFLARE_API_TOKEN??''))throw new Error('invalid_cloudflare_token_file');
  if(!/^[a-f0-9]{32}$/.test(values.CLOUDFLARE_ACCOUNT_ID??''))throw new Error('invalid_cloudflare_account_id');
  return values;
}
export function proxyFetch() {
  const require=createRequire(process.env.V3_TOOLING_ROOT?path.join(process.env.V3_TOOLING_ROOT,'package.json'):import.meta.url);
  const {fetch,EnvHttpProxyAgent}=require('undici'),dispatcher=new EnvHttpProxyAgent();
  return (url,options={})=>fetch(url,{...options,dispatcher});
}
export function cloudflareClient(credentials,{fetcher=proxyFetch()}={}) {
  const account=credentials.CLOUDFLARE_ACCOUNT_ID;
  async function request(endpoint,{method='GET',body}={}) {
    const response=await fetcher('https://api.cloudflare.com/client/v4'+endpoint,{method,headers:{Authorization:'Bearer '+credentials.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});
    const payload=await response.json();
    if(!response.ok||!payload.success)throw new Error('cloudflare_http_'+response.status+'_codes_'+(payload.errors??[]).map(e=>e.code).join('_'));
    return payload.result;
  }
  return {account,request,accountRequest:(endpoint,options)=>request('/accounts/'+account+endpoint,options)};
}
