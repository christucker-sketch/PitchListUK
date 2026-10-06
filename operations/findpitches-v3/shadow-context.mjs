import fs from 'node:fs';
import path from 'node:path';
import {cloudflareClient,readCredentials,proxyFetch} from './cloudflare-api.mjs';
import {openRemoteD1} from './remote-d1.mjs';

export async function shadowContext({credentialsFile,stateDirectory}) {
  const state=JSON.parse(fs.readFileSync(path.join(stateDirectory,'resources.json'))),secrets=JSON.parse(fs.readFileSync(path.join(stateDirectory,'worker-secrets.json')));
  const api=cloudflareClient(readCredentials(credentialsFile)),db=await openRemoteD1(api,state),fetcher=proxyFetch();
  async function call(role,route,body,{ingest=false}={}) {
    if(!state.urls[role]||!route.startsWith('/')||route.startsWith('//'))throw Error('owned_shadow_route_required');
    const response=await fetcher(state.urls[role]+route,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+(ingest?secrets.V3_INGEST_TOKEN:secrets.V3_OPERATOR_TOKEN),'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(90000)});
    const data=await response.json();if(!response.ok)throw Error('shadow_http_'+response.status+'_'+(/^[a-z0-9_]+$/.test(data.error??'')?data.error:'request_failed'));return data;
  }
  return {state,db,api,call,fetcher,ingestToken:secrets.V3_INGEST_TOKEN};
}
