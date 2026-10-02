import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { fetchPinnedPublicSource } from '../../operations/findpitches-v2/pinned-public-fetch.mjs';

function mockRequest({ statusCode=200, body='Venue: Riverside Showground', headers={} }={}) {
  const calls=[];
  const requestHttps=(target,options,callback)=>{
    calls.push({target:target.href,options});
    const req=new EventEmitter();
    req.end=()=>{
      options.lookup(target.hostname,{all:false},(error,address,family)=>{
        if(error){req.emit('error',error);return;}
        calls.at(-1).connectedAddress=address;
        calls.at(-1).connectedFamily=family;
        const response=Readable.from([Buffer.from(body)]);
        response.statusCode=statusCode;
        response.headers={'content-type':'text/html',...headers};
        callback(response);
      });
    };
    return req;
  };
  return {requestHttps,calls};
}

test('public address pinned into actual HTTPS connection; original host retained',async()=>{
 const mock=mockRequest();
 const response=await fetchPinnedPublicSource('https://market.example.org/vendors',
  {headers:{'user-agent':'FindPitchesBot/2.0'}},{
    resolve:async()=>[{address:'93.184.216.34',family:4}],
    requestHttps:mock.requestHttps
  });
 assert.equal(response.status,200);
 assert.equal(await response.text(),'Venue: Riverside Showground');
 assert.equal(mock.calls.length,1);
 assert.equal(mock.calls[0].target,'https://market.example.org/vendors');
 assert.equal(mock.calls[0].connectedAddress,'93.184.216.34');
 assert.equal(mock.calls[0].connectedFamily,4);
 assert.equal(mock.calls[0].options.agent,false);
});
test('DNS rebinding cannot sneak through a second ordinary socket lookup',async()=>{
 const mock=mockRequest();
 const response=await fetchPinnedPublicSource('https://market.example.org/vendors',{},{
    resolve:async()=>[{address:'2606:2800:220:1:248:1893:25c8:1946',family:6}],
    requestHttps:mock.requestHttps
 });
 assert.equal(response.status,200);
 assert.equal(mock.calls[0].connectedAddress,'2606:2800:220:1:248:1893:25c8:1946');
});
test('mixed public/private DNS, local literals, credential URLs and custom ports fail closed',async()=>{
 const mock=mockRequest();
 for(const addresses of [
   [{address:'10.0.0.1',family:4}],
   [{address:'93.184.216.34',family:4},{address:'127.0.0.1',family:4}],
   []
 ]) {
   await assert.rejects(fetchPinnedPublicSource('https://market.example.org/vendors',{},{
     resolve:async()=>addresses,requestHttps:mock.requestHttps
   }),/private_or_unknown_dns_rejected/);
 }
 for(const url of ['http://127.0.0.1/','https://user:pass@market.example.org/',
                   'https://market.example.org:8080/']) {
   await assert.rejects(fetchPinnedPublicSource(url,{},{
     resolve:async()=>[{address:'93.184.216.34',family:4}],
     requestHttps:mock.requestHttps
   }),/rejected_source_url/);
 }
 assert.equal(mock.calls.length,0);
});
test('redirects are not followed or resolved, leaving HTTP status to bounded provider',async()=>{
 const mock=mockRequest({statusCode:302,body:'redirect',headers:{location:'http://127.0.0.1/'}});
 const response=await fetchPinnedPublicSource('https://market.example.org/vendors',{},{
   resolve:async()=>[{address:'93.184.216.34',family:4}],
   requestHttps:mock.requestHttps
 });
 assert.equal(response.status,302);
 assert.equal(mock.calls.length,1);
 await response.body.cancel();
});
