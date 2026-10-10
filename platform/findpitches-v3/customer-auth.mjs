import {hash} from './contract.mjs';
import {stmt,cookies,opaqueToken,cookie,sessionCookie,previewCookie,safeNext,customerError,rateLimit,noteCustomerEvent} from './customer-security.mjs';
import {mailCredentialIsProxyReference} from './customer-mail.mjs';

export async function previewAllowed(request,db,now) {
  const token=cookies(request)[previewCookie];if(!token||!/^[a-f0-9]{64}$/.test(token))return false;
  return Boolean(await stmt(db,'SELECT token_hash FROM preview_access WHERE token_hash=? AND expires_at>?',await hash(token),now).first());
}
export async function grantPreview(db,now) {const token=opaqueToken();await stmt(db,'INSERT INTO preview_access VALUES (?,?,?)',await hash(token),new Date(Date.parse(now)+86400000).toISOString(),now).run();return cookie(previewCookie,token,86400);}
export async function signedCustomer(request,db,now) {
  const token=cookies(request)[sessionCookie];if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
  return stmt(db,`SELECT c.* FROM customer_sessions s JOIN customers c ON c.id=s.customer_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>?`,await hash(token),now).first();
}
export function needCustomer(customer) {if(!customer)throw customerError('auth_required',401);return customer;}
export function emailAddress(value) {if(typeof value!=='string'||value.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))throw customerError('invalid_email');return value.trim().toLowerCase();}
export async function issueChallenge(db,{email,next,now}) {
  const token=opaqueToken();await stmt(db,'INSERT INTO login_challenges VALUES (?,?,?,?,NULL,?)',await hash(token),emailAddress(email),safeNext(next),new Date(Date.parse(now)+900000).toISOString(),now).run();return token;
}
export async function requestLogin(request,env,body,{now,fetcher=fetch}={}) {
  const email=emailAddress(body.email),db=env.V3_CUSTOMER_DB;
  await rateLimit(db,'login/ip/'+(request.headers.get('CF-Connecting-IP')??'local'),{limit:20,now});
  await rateLimit(db,'login/email/'+email,{limit:5,now});
  if(!env.V3_EMAIL_API_KEY||!env.V3_EMAIL_FROM||mailCredentialIsProxyReference(env.V3_EMAIL_API_KEY))throw customerError('service_unavailable',503);
  let sender;try{sender=emailAddress(env.V3_EMAIL_FROM);}catch{throw customerError('service_unavailable',503);}
  const token=await issueChallenge(db,{email,next:body.next,now}),link=new URL('/api/v3/session/verify',request.url);link.searchParams.set('token',token);
  const response=await fetcher('https://api.smtp2go.com/v3/email/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({api_key:env.V3_EMAIL_API_KEY,sender,to:[email],subject:'Sign in to FindPitches',text_body:`Your one-time FindPitches sign-in link expires in 15 minutes:\n${link}\nIf you did not request it, ignore this email.`}),signal:AbortSignal.timeout(20000)});
  const result=await response.json();if(!response.ok||result.data?.succeeded!==1){await stmt(db,'DELETE FROM login_challenges WHERE token_hash=?',await hash(token)).run();throw customerError('service_unavailable',503);}
  await noteCustomerEvent(db,'auth_link','sent',now);return {sent:true};
}
export async function consumeChallenge(db,token,now) {
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw customerError('invalid_link');
  const challenge=await stmt(db,'UPDATE login_challenges SET consumed_at=? WHERE token_hash=? AND consumed_at IS NULL AND expires_at>? RETURNING email,next_path',now,await hash(token),now).first();
  if(!challenge)throw customerError('invalid_link');
  await stmt(db,'INSERT OR IGNORE INTO customers(id,email,created_at) VALUES (?,?,?)','cusv3_'+crypto.randomUUID(),challenge.email,now).run();
  const customer=await stmt(db,'SELECT * FROM customers WHERE email=?',challenge.email).first(),session=opaqueToken();
  await stmt(db,'INSERT INTO customer_sessions VALUES (?,?,?,NULL,?)',await hash(session),customer.id,new Date(Date.parse(now)+604800000).toISOString(),now).run();
  await noteCustomerEvent(db,'auth_session','issued',now);return {customer,next:challenge.next_path,cookie:cookie(sessionCookie,session)};
}
export async function logout(request,db,now) {const token=cookies(request)[sessionCookie];if(token)await stmt(db,'UPDATE customer_sessions SET revoked_at=? WHERE token_hash=?',now,await hash(token)).run();return cookie(sessionCookie,'',0);}
export async function updateProfile(db,customer,body) {
  const profile=JSON.parse(customer.profile_json),allowed=['business_name','contact_name','phone','market','base_postcode','specialty','regions','public_listing_opt_in'];
  for(const key of Object.keys(body)){if(!allowed.includes(key))throw customerError('validation');const value=body[key];if(key==='public_listing_opt_in'){if(typeof value!=='boolean')throw customerError('validation');}else if(key==='regions'){if(!Array.isArray(value)||value.length>30||value.some(v=>typeof v!=='string'||v.length>100))throw customerError('validation');}else if(value!==null&&(typeof value!=='string'||value.length>200))throw customerError('validation');profile[key]=value;}
  if(profile.market&&!['GB','US','CA','AU','NZ','IE','SG','HK'].includes(profile.market))throw customerError('validation');
  await stmt(db,'UPDATE customers SET profile_json=? WHERE id=?',JSON.stringify(profile),customer.id).run();return {...customer,profile_json:JSON.stringify(profile)};
}
