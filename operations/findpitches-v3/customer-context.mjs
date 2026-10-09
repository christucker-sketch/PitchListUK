import fs from 'node:fs';import path from 'node:path';
import {proxyFetch,cloudflareClient,readCredentials} from './cloudflare-api.mjs';
export async function customerContext({credentialsFile,customerDirectory}) {
  const state=JSON.parse(fs.readFileSync(path.join(customerDirectory,'resources.json'),'utf8')),secrets=JSON.parse(fs.readFileSync(path.join(customerDirectory,'secrets-private.json'),'utf8')),api=cloudflareClient(readCredentials(credentialsFile));
  if(state.worker!=='findpitches-v3-customer-preview'||state.database_name!=='findpitches-v3-customer-preview'||state.account_id!==api.account||!/^https:\/\/findpitches-v3-customer-preview\.[a-z0-9-]+\.workers\.dev$/.test(state.url))throw Error('owned_customer_preview_required');
  const database=await api.accountRequest('/d1/database/'+state.database_id);if(database.name!==state.database_name)throw Error('customer_database_mismatch');
  const fetcher=proxyFetch(),cookieJar=new Map();
  async function call(route,{method='GET',body,operator=false}={}) {
    if(!route.startsWith('/')||route.startsWith('//'))throw Error('preview_route_required');
    const response=await fetcher(state.url+route,{method,headers:{...(operator?{Authorization:'Bearer '+secrets.V3_PREVIEW_OPERATOR_TOKEN}:{}),Cookie:[...cookieJar].map(([k,v])=>k+'='+v).join('; '),Origin:state.url,...(body!==undefined?{'Content-Type':'application/json'}:{}),...(method!=='GET'?{'x-csrf-token':cookieJar.get('fp_csrf')??''}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{}),redirect:'manual',signal:AbortSignal.timeout(60000)});
    for(const c of response.headers.getSetCookie()){const first=c.split(';')[0],i=first.indexOf('=');cookieJar.set(first.slice(0,i),first.slice(i+1));}
    let data;try{data=await response.json();}catch{data=null;}
    if(response.status>=400){const error=Error('customer_http_'+response.status+'_'+(data?.error??'request_failed'));error.route=new URL(route,state.url).pathname;throw error;}
    return {status:response.status,data,location:response.headers.get('location'),headers:response.headers};
  }
  const query=async(sql,params=[])=>{const result=await api.accountRequest('/d1/database/'+state.database_id+'/query',{method:'POST',body:{sql,params}});if(!result.every(r=>r.success))throw Error('customer_query_failed');return result[0].results;};
  return {state,secrets,api,fetcher,call,cookieJar,query};
}
