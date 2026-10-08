// Public platform catalogues are discovery evidence only. They cannot confer READY.
import {hash} from './contract.mjs';
import {decode,parseHtml,nodes,text} from './source-dom.mjs';

const HOSTS=new Set(['eventeny.com','www.eventeny.com','localstalls.com','www.localstalls.com']);
export function catalogueUrl(value) {
  try {const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&HOSTS.has(u.hostname)
    &&!u.search&&!u.hash&&(u.pathname==='/robots.txt'||/^\/(?:sitemaps?\/)?sitemap[a-zA-Z0-9_.-]*\.xml$/.test(u.pathname)
      ||/^(?:www\.)?eventeny\.com$/.test(u.hostname)&&/^\/sitemap\/(?:events|event_elements)\d*\.xml$/.test(u.pathname)
      ||/^(?:www\.)?localstalls\.com$/.test(u.hostname)&&/^\/sitemaps\/events-(?:au|nz|uk|us|ca)-\d+\.xml$/.test(u.pathname));}catch{return false;}
}
export async function fetchCatalogueDocument(url,{fetcher=fetch,now=new Date().toISOString()}={}) {
  if(!catalogueUrl(url))throw Error('approved_public_catalogue_required');
  let current=url;const visited=[];
  try {for(let i=0;i<=3;i++) {
    if(!catalogueUrl(current)||visited.includes(current))return {requested_url:url,fetched_at:now,reason:'catalogue_redirect_rejected'};
    visited.push(current);const r=await fetcher(current,{redirect:'manual',headers:{'User-Agent':'FindPitches-V3-Shadow-Verification/1.0',Accept:'text/plain,application/xml,text/xml'},signal:AbortSignal.timeout(12000)});
    if([301,302,303,307,308].includes(r.status)){current=new URL(r.headers.get('location'),current).href;continue;}
    const meta={requested_url:url,url:current,fetched_at:now,http_status:r.status,redirect_chain:visited};
    if(!r.ok)return {...meta,reason:'catalogue_http_'+r.status};
    const reader=r.body.getReader(),parts=[];let size=0,truncated=false;
    try {for(;;){const {done,value}=await reader.read();if(done)break;const remaining=2097152-size;
      if(value.length>remaining){parts.push(value.slice(0,remaining));size+=remaining;truncated=true;await reader.cancel();break;}
      size+=value.length;parts.push(value);
    }}finally{reader.releaseLock();}
    const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}
    const content=new TextDecoder().decode(bytes);
    if(current.endsWith('/robots.txt')?/^\s*</.test(content):!/^\s*(?:<\?xml[^>]*>\s*)?<(?:urlset|sitemapindex)\b/.test(content))return {...meta,reason:'catalogue_format_not_proved'};
    return {...meta,content,content_hash:await hash(content),truncated,retained_bytes:size,coverage:truncated?'bounded_prefix_only':'complete_document'};
  }return {requested_url:url,fetched_at:now,reason:'catalogue_redirect_limit'};
  }catch{return {requested_url:url,fetched_at:now,reason:'catalogue_fetch_failed'};}
}
export function platformRoute(value) {
  try {const u=new URL(decode(value));if(u.protocol!=='https:'||u.username||u.password||u.port||!HOSTS.has(u.hostname))return null;u.hash='';
    for(const key of [...u.searchParams.keys()])if(/^(?:utm_|fbclid|srsltid|aff)/i.test(key))u.searchParams.delete(key);
    if(/(?:^|\.)eventeny\.com$/.test(u.hostname)) {
      if(/^\/events\/vendor\/?$/.test(u.pathname)&&/^\d+$/.test(u.searchParams.get('id')??''))return {url:u.href,family:'eventeny',kind:'application',identity:'eventeny:vendor:'+u.searchParams.get('id')};
      if(/^\/events\/[^/]+-\d+\/?$/.test(u.pathname))return {url:u.href,family:'eventeny',kind:'event_detail'};
    }
    if(/(?:^|\.)localstalls\.com$/.test(u.hostname)&&/^\/(?:uk|au|nz|us|ca)\/event\/[^/]+\/[^/]+\/?$/.test(u.pathname))return {url:u.href,family:'localstalls',kind:'application'};
    return null;
  }catch{return null;}
}
export function catalogueLinks(document) {
  if(document.reason||typeof document.content!=='string')return {catalogues:[],routes:[]};
  // No XML entities/DTD are evaluated; external entity declarations are rejected.
  if(/<!DOCTYPE|<!ENTITY/i.test(document.content))throw Error('catalogue_entity_declaration_rejected');
  const catalogues=[],routes=[],seen=new Set();
  for(const m of document.content.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)) {
    const url=decode(m[1].trim());if(seen.has(url))continue;seen.add(url);
    if(catalogueUrl(url))catalogues.push(url);else {const route=platformRoute(url);if(route)routes.push(route);}
  }
  return {catalogues,routes};
}
export function eventApplicationLinks(document) {
  const detail=platformRoute(document.url??document.requested_url);if(detail?.kind!=='event_detail'||!document.html||document.reason)return [];
  const root=parseHtml(document.html),out=new Map();
  for(const a of nodes(root,n=>n.tag==='a'&&n.attrs.href,{scoped:true})) {
    let route;try{route=platformRoute(new URL(a.attrs.href,document.url).href);}catch{}
    if(route?.kind==='application')out.set(route.identity??route.url,{...route,label:text(a).slice(0,500)});
  }
  return [...out.values()];
}
