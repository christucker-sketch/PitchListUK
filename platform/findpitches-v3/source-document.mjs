import {hash} from './contract.mjs';
import {legacySourceUrl} from './legacy.mjs';

export function safeSourceUrl(url) {
  if(!legacySourceUrl(url))return false;
  const u=new URL(url);return !u.port||u.port==='443';
}
export async function fetchSourceDocument(url,{fetcher=fetch,now=new Date().toISOString()}={}) {
  let current=url;const visited=[];
  try {
    for(let redirects=0;redirects<=3;redirects++) {
      if(!safeSourceUrl(current))return {reason:'unsafe_original_source_url',requested_url:url,fetched_at:now};
      if(visited.includes(current))return {reason:'source_redirect_loop',requested_url:url,fetched_at:now};
      visited.push(current);
      const response=await fetcher(current,{redirect:'manual',headers:{'User-Agent':'FindPitches-V3-Shadow-Verification/1.0','Accept':'text/html,application/xhtml+xml'},signal:AbortSignal.timeout(12000)});
      if([301,302,303,307,308].includes(response.status)) {const target=response.headers.get('location');if(!target)return {reason:'source_redirect_missing',requested_url:url,fetched_at:now};current=new URL(target,current).toString();continue;}
      const meta={requested_url:url,url:current,fetched_at:now,http_status:response.status,redirect_chain:visited};
      if(!response.ok) {
        const header=response.headers.get('retry-after'),delay=/^\d+$/.test(header??'')?Number(header):Math.ceil((Date.parse(header)-Date.parse(now))/1000);
        return {...meta,reason:'source_http_'+response.status,...response.status===429?{retry_after_seconds:Math.min(3600,Math.max(60,Number.isFinite(delay)?delay:900))}:{}};
      }
      const contentType=response.headers.get('content-type')??'';
      if(!/(?:text\/html|application\/xhtml\+xml)/i.test(contentType))return {...meta,reason:'source_format_requires_review'};
      const reader=response.body.getReader(),parts=[];let size=0;
      try {for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1048576){await reader.cancel();return {...meta,reason:'source_response_size_limit'};}parts.push(value);}}
      finally {reader.releaseLock();}
      const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
      const html=new TextDecoder().decode(bytes);
      return {...meta,content_type:contentType,html,content_hash:await hash(html)};
    }
    return {reason:'source_redirect_limit',requested_url:url,fetched_at:now};
  } catch {return {reason:'source_fetch_failed',requested_url:url,fetched_at:now};}
}
