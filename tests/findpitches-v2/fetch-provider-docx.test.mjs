import test from 'node:test';
import assert from 'node:assert/strict';
import { createHttpFetchProvider } from '../../platform/findpitches-v2/providers/fetch/http.mjs';

const docxBytes=new Uint8Array([0x50,0x4b,0x03,0x04,0x00,0x00,0x00,0x00]);
function response(body,contentType,url='https://example.test/apply.docx'){
  const r=new Response(body,{headers:{'content-type':contentType}});
  Object.defineProperty(r,'url',{value:url});
  return r;
}

test('fetch provider extracts DOCX through injected bounded parser',async()=>{
  let called=0;
  const provider=createHttpFetchProvider({
    fetchImpl:async()=>response(docxBytes,'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    docxExtractor(bytes){called++;assert.equal(bytes[0],0x50);return 'Vendor application - apply to trade in 2027.';}
  });
  const page=await provider.fetch('https://example.test/apply.docx');
  assert.equal(called,1);
  assert.equal(page.content_type,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.match(page.body,/apply to trade/);
});

test('fetch provider accepts DOCX URL served as application/octet-stream',async()=>{
  const provider=createHttpFetchProvider({
    fetchImpl:async()=>response(docxBytes,'application/octet-stream'),
    docxExtractor:async()=> 'Stallholder application for the Christmas Fair.'
  });
  assert.match((await provider.fetch('https://example.test/apply.docx')).body,/Stallholder application/);
});

test('malformed DOCX receives a dedicated invalid signature error',async()=>{
  const provider=createHttpFetchProvider({
    fetchImpl:async()=>response('not a zip','application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    docxExtractor(){throw new Error('should not run');}
  });
  await assert.rejects(()=>provider.fetch('https://example.test/apply.docx'),/docx_invalid_signature/);
});

test('ordinary HTML never invokes DOCX parser',async()=>{
  const provider=createHttpFetchProvider({
    fetchImpl:async()=>response('<p>Vendor application</p>','text/html','https://example.test/'),
    docxExtractor(){throw new Error('should not parse HTML');}
  });
  assert.match((await provider.fetch('https://example.test/')).body,/Vendor application/);
});


test('fetch provider sniffs DOCX bytes behind application/download without a file extension',async()=>{
  const provider=createHttpFetchProvider({
    fetchImpl:async()=>response(docxBytes,'application/download','https://example.test/application.php?id=42'),
    docxExtractor:async()=> 'Vendor application for the county fair.'
  });
  const page=await provider.fetch('https://example.test/application.php?id=42');
  assert.equal(page.content_type,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.match(page.body,/county fair/);
});

test('generic binary non-PDF non-DOCX still fails closed',async()=>{
  const provider=createHttpFetchProvider({
    fetchImpl:async()=>response(new Uint8Array([1,2,3,4,5]),'application/download','https://example.test/download?id=7')
  });
  await assert.rejects(()=>provider.fetch('https://example.test/download?id=7'),/fetch_content_type_unsupported:application\/download/);
});
