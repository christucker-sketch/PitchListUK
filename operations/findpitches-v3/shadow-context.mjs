import fs from 'node:fs';
import path from 'node:path';
import {cloudflareClient,readCredentials,proxyFetch} from './cloudflare-api.mjs';
import {openRemoteD1} from './remote-d1.mjs';

export async function shadowContext({credentialsFile,stateDirectory}) {
  const state=JSON.parse(fs.readFileSync(path.join(stateDirectory,'resources.json'))),secrets=JSON.parse(fs.readFileSync(path.join(stateDirectory,'worker-secrets.json')));
  const api=cloudflareClient(readCredentials(credentialsFile)),db=await openRemoteD1(api,state),fetcher=proxyFetch();
  async function call(role,route,body,{ingest=false}={}) {
    if(!state.urls[role]||!route.startsWith('/')||route.startsWith('//'))throw Error('owned_shadow_route_required');
    let response;
    try{response=await fetcher(state.urls[role]+route,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+(ingest?secrets.V3_INGEST_TOKEN:secrets.V3_OPERATOR_TOKEN),'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(90000)});}
    catch(e){throw Error(['TimeoutError','AbortError'].includes(e.name)?'shadow_fetch_timeout_'+role:'shadow_fetch_failed_'+role);}
    let data;try{data=await response.json();}catch{throw Error('shadow_invalid_json_'+role+'_'+response.status);}
    if(!response.ok){const error=Error('shadow_http_'+response.status+'_'+(/^[a-z0-9_]+$/.test(data.error??'')?data.error:'request_failed'));if(/^[a-z0-9_]{1,40}$/.test(data.diagnostic_code??''))error.diagnostic_code=data.diagnostic_code;throw error;}return data;
  }
  return {state,db,api,call,fetcher,ingestToken:secrets.V3_INGEST_TOKEN};
}
