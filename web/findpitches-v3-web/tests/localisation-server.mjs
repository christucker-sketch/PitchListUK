// Loopback-only synthetic browser harness; never deployed or included in public/.
import http from 'node:http';
import worker from '../../../platform/findpitches-v3/customer-worker.mjs';
import {localisationFixture} from '../../../tests/findpitches-v3/fixtures/customer-localisation.mjs';
import {grantPreview,issueChallenge,consumeChallenge} from '../../../platform/findpitches-v3/customer-auth.mjs';
import {stmt} from '../../../platform/findpitches-v3/customer-security.mjs';
const {db,env}=localisationFixture(),gate=(await grantPreview(db,new Date().toISOString())).split(';')[0];
const server=http.createServer(async(req,res)=>{
  try{
    const origin='http://127.0.0.1:8794',url=new URL(req.url,origin);
    if(url.pathname==='/__fixture/login'&&req.method==='POST'){
      const now=new Date().toISOString(),token=await issueChallenge(db,{email:'browser@example.org',next:'/account.html',now}),login=await consumeChallenge(db,token,now);
      await stmt(db,'INSERT OR IGNORE INTO stripe_customers VALUES (?,?,0,?)',login.customer.id,'cus_fixture',now).run();
      await stmt(db,'INSERT OR REPLACE INTO stripe_subscriptions VALUES (?,?,?,?,?,?,?,?,?,0,?)','sub_fixture',login.customer.id,'cus_fixture','price_fixture','GB','active','2099-12-31T00:00:00Z',null,0,now).run();
      res.writeHead(200,{'content-type':'application/json','set-cookie':login.cookie.replace('__Host-fp_v3_session','fp_fixture_session').replace(/; Secure/gi,'')});return res.end('{"ok":true}');
    }
    const parts=[];for await(const part of req)parts.push(part);const headers=new Headers(req.headers);headers.set('cookie',gate+'; '+(req.headers.cookie||'').replace(/fp_fixture_session=/g,'__Host-fp_v3_session='));
    const r=await worker.fetch(new Request(url,{method:req.method,headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(parts)})}),env);
    const out=Object.fromEntries(r.headers);if(r.headers.has('set-cookie'))out['set-cookie']=r.headers.getSetCookie().map(c=>c.replace(/; Secure/gi,''));res.writeHead(r.status,out);res.end(Buffer.from(await r.arrayBuffer()));
  }catch(e){console.error(e.code||e.message);res.writeHead(500);res.end('Fixture failed');}
});
server.listen(8794,'127.0.0.1',()=>console.log('Synthetic localisation fixture listening on 127.0.0.1:8794'));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>{db.close();process.exit();}));
