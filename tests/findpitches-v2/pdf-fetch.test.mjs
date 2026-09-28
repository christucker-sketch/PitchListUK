import test from 'node:test';
import assert from 'node:assert/strict';
import { createHttpFetchProvider } from '../../platform/findpitches-v2/providers/fetch/http.mjs';

const response=(body,type,url='https://example.test/apply.pdf')=>({ok:true,url,headers:new Headers({'content-type':type}),arrayBuffer:async()=>new TextEncoder().encode(body).buffer});

test('HTML remains supported',async()=>{
 const provider=createHttpFetchProvider({fetchImpl:async()=>response('<h1>Traders apply</h1>','text/html','https://example.test/apply')});
 const page=await provider.fetch('https://example.test/apply');
 assert.match(page.body,/Traders apply/);
});

test('Malformed PDF is not misclassified as text',async()=>{
 const provider=createHttpFetchProvider({fetchImpl:async()=>response('%PDF-not-a-valid-document','application/pdf')});
 await assert.rejects(provider.fetch('https://example.test/apply.pdf'));
});

test('Oversized PDFs are rejected before parsing',async()=>{
 const provider=createHttpFetchProvider({maxBytes:10,fetchImpl:async()=>response('%PDF-this-is-too-long','application/pdf')});
 await assert.rejects(provider.fetch('https://example.test/apply.pdf'),/too_large/);
});
