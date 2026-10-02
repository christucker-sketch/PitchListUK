// One-off operator HTTP transport for v2 venue recovery. Every request uses
// a pinned, publicly resolved IP via Node's native socket lookup callback.
// No proxy, redirects, local literals, custom ports or DNS-rebinding window
// between DNS preflight and TCP connection. Response bytes/time are bounded
// separately by the existing HTTP fetch provider.
import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { Readable } from 'node:stream';
import { allowedExistingSource } from '../../platform/findpitches-v2/quality/us-venue-recovery-runner.mjs';
import { isSafeResolvedAddress } from './public-source-dns.mjs';

export async function fetchPinnedPublicSource(raw, options = {}, {
  resolve = dnsLookup, requestHttp = httpRequest, requestHttps = httpsRequest
} = {}) {
  const safe = allowedExistingSource(raw);
  if (!safe) throw new Error('rejected_source_url');
  const target = new URL(safe);
  const addresses = await resolve(target.hostname, {all:true,verbatim:true});
  if (!Array.isArray(addresses) || !addresses.length ||
      addresses.some(a=>!isSafeResolvedAddress(a.address,a.family))) {
    throw new Error('private_or_unknown_dns_rejected');
  }
  const selected=addresses[0];
  if (options.signal?.aborted) throw options.signal.reason || new Error('fetch_aborted');
  const pinnedLookup=(_host,opts,cb)=>{
    if (opts?.all) cb(null,[{address:selected.address,family:selected.family}]);
    else cb(null,selected.address,selected.family);
  };
  // Keep original hostname for Host header, HTTPS certificate verification and
  // SNI. Do not fall back to a fresh DNS lookup after pinning.
  const requestImpl=target.protocol==='https:'?requestHttps:requestHttp;
  const incoming=await new Promise((resolveResponse,reject)=>{
    const req=requestImpl(target,{
      method:'GET',headers:options.headers,signal:options.signal,
      lookup:pinnedLookup,agent:false
    },resolveResponse);
    req.once('error',reject);
    req.end();
  });
  const status=incoming.statusCode || 0;
  if (status<200 || status>599) {
    incoming.destroy();
    throw new Error('invalid_source_http_status');
  }
  // Never follow redirects. The caller must separately verify any new source
  // URL before making another bounded request.
  const body=[204,205,304].includes(status)?null:Readable.toWeb(incoming);
  return new Response(body,{status,headers:incoming.headers});
}
