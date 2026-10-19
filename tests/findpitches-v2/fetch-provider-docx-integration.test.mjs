import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { createHttpFetchProvider } from '../../platform/findpitches-v2/providers/fetch/http.mjs';

function docxFixture(){
  const xml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+
    '<w:p><w:r><w:t>Vendor application</w:t></w:r></w:p>'+
    '<w:p><w:r><w:t>Apply to trade at the Spring Fair in 2027.</w:t></w:r></w:p>'+
    '</w:body></w:document>';
  return zipSync({'word/document.xml':strToU8(xml)});
}
function response(body,contentType,url='https://example.test/vendor.docx'){
  const r=new Response(body,{headers:{'content-type':contentType}});
  Object.defineProperty(r,'url',{value:url});
  return r;
}

test('actual fflate parser extracts text from a genuine DOCX container',async()=>{
  const provider=createHttpFetchProvider({
    fetchImpl:async()=>response(docxFixture(),'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  });
  const page=await provider.fetch('https://example.test/vendor.docx');
  assert.equal(page.content_type,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.match(page.body,/Vendor application/);
  assert.match(page.body,/Apply to trade/);
  assert.match(page.body,/2027/);
});
