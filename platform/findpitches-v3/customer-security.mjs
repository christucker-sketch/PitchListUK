import {hash} from './contract.mjs';

export const sessionCookie='__Host-fp_v3_session',previewCookie='__Host-fp_v3_preview';
export const cookies=request=>Object.fromEntries((request.headers.get('cookie')??'').split(/;\s*/).filter(Boolean).map(v=>{const i=v.indexOf('=');return [v.slice(0,i),v.slice(i+1)];}));
export const opaqueToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
export const cookie=(name,value,maxAge=604800,httpOnly=true)=>`${name}=${value}; Path=/; Secure; SameSite=Lax; Max-Age=${maxAge}${httpOnly?'; HttpOnly':''}`;
export function safeNext(value) {
  if(typeof value!=='string'||value.length>1024||!value.startsWith('/')||value.startsWith('//')||/[\\\r\n]/.test(value))return '/account.html';
  const u=new URL(value,'https://v3.invalid');return u.origin==='https://v3.invalid'?u.pathname+u.search:'/account.html';
}
export function customerError(code,status=400) {const e=Error(code);e.code=code;e.status=status;return e;}
export const stmt=(db,q,...values)=>db.prepare(q).bind(...values);
export async function hmac(secret,value) {
  if(typeof secret!=='string'||secret.length<32)throw customerError('service_unavailable',503);
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
}
export function same(a,b) {if(typeof a!=='string'||typeof b!=='string')return false;let n=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)n|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return n===0;}
export async function operator(request,env) {return typeof env.V3_PREVIEW_OPERATOR_TOKEN==='string'&&env.V3_PREVIEW_OPERATOR_TOKEN.length>=24&&same(await hash(request.headers.get('authorization')??''),await hash('Bearer '+env.V3_PREVIEW_OPERATOR_TOKEN));}
export async function csrfValue(env) {const nonce=opaqueToken();return nonce+'.'+await hmac(env.V3_SESSION_SECRET,nonce);}
export async function requireCsrf(request,env) {
  const origin=new URL(request.url).origin,c=cookies(request).fp_csrf,header=request.headers.get('x-csrf-token');
  if(request.headers.get('origin')!==origin||!same(c,header)||!c||c.length!==129)throw customerError('csrf_failed',403);
  const [nonce,signature]=c.split('.');if(!same(signature,await hmac(env.V3_SESSION_SECRET,nonce)))throw customerError('csrf_failed',403);
}
export async function rateLimit(db,key,{limit=10,seconds=3600,now=new Date().toISOString()}={}) {
  const window=String(Math.floor(Date.parse(now)/1000/seconds)),safeKey=await hash(key);
  const row=await stmt(db,`INSERT INTO customer_rate_limits(key,window,count) VALUES (?,?,1) ON CONFLICT(key) DO UPDATE SET window=excluded.window,count=CASE WHEN customer_rate_limits.window=excluded.window THEN count+1 ELSE 1 END RETURNING count`,safeKey,window).first();
  if(row.count>limit)throw customerError('rate_limited',429);
}
export async function readText(request,maxBytes=32768) {
  if(Number(request.headers.get('content-length'))>maxBytes)throw customerError('validation');
  const reader=request.body?.getReader();if(!reader)return '';
  const parts=[];let length=0;
  try {for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>maxBytes)throw customerError('validation');parts.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}
  return new TextDecoder().decode(bytes);
}
export async function readBody(request) {
  const text=await readText(request);if(!text)return {};
  try {const result=JSON.parse(text);if(!result||typeof result!=='object'||Array.isArray(result))throw Error();return result;}catch{throw customerError('validation');}
}
export async function noteCustomerEvent(db,kind,outcome,now=new Date().toISOString()) {await stmt(db,'INSERT INTO customer_operation_events(kind,outcome,occurred_at) VALUES (?,?,?)',kind,outcome,now).run();}
