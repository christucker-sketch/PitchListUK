// Local browser-test adapter only. Upstream TLS verification stays enabled.
// The browser sees rendered assets/data from the restricted DEPLOYED V3 service.
// This does not test its public certificate in Chromium or native cookie scope.
import fs from 'node:fs';import http from 'node:http';import path from 'node:path';
import {proxyFetch} from './cloudflare-api.mjs';
const args=process.argv.slice(2),get=k=>args[args.indexOf(k)+1],input=JSON.parse(fs.readFileSync(get('--access-file'),'utf8')),upstream=new URL(input.base),port=Number(get('--port')??8795);
if(!/^findpitches-v3-customer-preview\.[a-z0-9-]+\.workers\.dev$/.test(upstream.hostname)||upstream.protocol!=='https:')throw Error('owned_preview_upstream_required');
const jar=new Map(input.cookies.map(c=>[c.name,c.value])),fetcher=proxyFetch();let requests=0,failures=0;
const base='http://127.0.0.1:'+port;
fs.writeFileSync(get('--browser-access-out'),JSON.stringify({base,cookies:[{name:'fp_csrf',value:jar.get('fp_csrf')??'',url:base,secure:false,httpOnly:false,sameSite:'Lax'}],transport:'loopback_relay_with_verified_https_upstream'}),{mode:0o600});
http.createServer(async(req,res)=>{
  try {
    if(req.url==='/__relay_health'){res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify({requests,failures,upstream:'owned_v3_preview',tls_verification:true}));}
    if(req.url.startsWith('//'))throw Error('invalid_route');requests++;
    const pieces=[];let size=0;for await(const part of req){size+=part.length;if(size>32768)throw Error('request_size');pieces.push(part);}
    const browserCookies=Object.fromEntries((req.headers.cookie??'').split(/;\s*/).map(c=>c.split('=')));if(browserCookies.fp_csrf)jar.set('fp_csrf',browserCookies.fp_csrf);
    const headers={Cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),Origin:upstream.origin};for(const name of ['content-type','x-csrf-token','accept'])if(req.headers[name])headers[name]=req.headers[name];
    const r=await fetcher(new URL(req.url,upstream).href,{method:req.method,headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(pieces)}),redirect:'manual',signal:AbortSignal.timeout(60000)});
    const down={};for(const name of ['content-type','content-security-policy','x-robots-tag','x-content-type-options','cache-control'])if(r.headers.has(name))down[name]=r.headers.get(name);
    for(const c of r.headers.getSetCookie()){const first=c.split(';')[0],i=first.indexOf('=');jar.set(first.slice(0,i),first.slice(i+1));if(c.startsWith('fp_csrf='))down['set-cookie']=c.replace(/; Secure/gi,'');}
    if(r.headers.has('location')){const target=new URL(r.headers.get('location'),upstream);if(target.origin!==upstream.origin)throw Error('external_redirect_refused');down.location=target.pathname+target.search;}
    res.writeHead(r.status,down);res.end(Buffer.from(await r.arrayBuffer()));
  }catch{failures++;res.writeHead(502);res.end('Preview relay unavailable');}
}).listen(port,'127.0.0.1',()=>console.log('Verified HTTPS preview relay listening on loopback port '+port));
