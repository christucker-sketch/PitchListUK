import test from 'node:test';import assert from 'node:assert/strict';import {encodeSourceDocument,decodeSourceDocument} from '../../platform/findpitches-v3/document-custody.mjs';import {fetchSourceDocument} from '../../platform/findpitches-v3/source-document.mjs';import {parseHtml} from '../../platform/findpitches-v3/source-dom.mjs';
import {randomBytes} from 'node:crypto';import {bindEvidenceArchive} from '../../platform/findpitches-v3/evidence-archive.mjs';import {archiveBucket} from './storage-fixture.mjs';
test('large incompressible attachment custody uses verified R2 originals without the inline D1 compression limit',async()=>{
 const db={},bucket=archiveBucket();bindEvidenceArchive(db,bucket,{writeEnabled:true});const d={requested_url:'https://official.example/apply',url:'https://official.example/apply',fetched_at:'2026-10-16T09:00:00Z',documents:[{document_kind:'official_pdf_original',pdf_base64:randomBytes(1400000).toString('base64')}]};
 const pointer=await encodeSourceDocument(d,{db});assert.equal(JSON.parse(pointer).document_kind,'r2_source_custody_v1');assert.ok(pointer.length<2000);assert.deepEqual(await decodeSourceDocument(pointer,{db}),d);assert.equal(bucket.objects.size,1);await encodeSourceDocument(d,{db});assert.equal(bucket.objects.size,1);await assert.rejects(encodeSourceDocument(d),/source_custody_size_limit/);
});
test('large proof custody is lossless and preserves its source route/hash/check clock',async()=>{
 const d={requested_url:'https://official.example/event',url:'https://official.example/event',fetched_at:'2026-10-13T06:00:00Z',content_hash:'source-original',documents:[{html:'<main>'+('Source evidence 😀'.repeat(70000))+'</main>'}]};
 const encoded=await encodeSourceDocument(d),w=JSON.parse(encoded);assert.equal(w.encoding,'gzip-base64-v1');assert.ok(encoded.length<900000);assert.deepEqual(await decodeSourceDocument(encoded),d);
 for(const change of [{uncompressed_hash:'forged'},{fetched_at:'2026-10-13T12:00:00Z'},{uncompressed_bytes:50000000},{gzip_base64:w.gzip_base64.slice(0,-4)+'xxxx'}])await assert.rejects(decodeSourceDocument(JSON.stringify({...w,...change})),/source_custody_/);
});
test('small existing custody stays compatible; oversized bodies and decompression overclaims hold',async()=>{
 const d={html:'<main>Original</main>',fetched_at:'2026-10-13T06:00:00Z'};assert.deepEqual(await decodeSourceDocument(await encodeSourceDocument(d)),d);await assert.rejects(encodeSourceDocument({html:'x'.repeat(4*1048576)}),/source_custody_size_limit/);
});
test('larger source parsing is a bounded caller choice and does not relax generic defaults',async()=>{
 const html='<main>'+('x'.repeat(1300000))+'</main>',fetcher=async()=>new Response(html,{headers:{'Content-Type':'text/html'}});
 assert.equal((await fetchSourceDocument('https://official.example/event',{fetcher})).reason,'source_response_size_limit');
 const large=await fetchSourceDocument('https://official.example/event',{fetcher,maxBytes:2097152});assert.equal(large.html,html);assert.throws(()=>parseHtml(html),/source_html_size_limit/);assert.equal(parseHtml(html,{maxBytes:2097152}).tag,'root');await assert.rejects(fetchSourceDocument('https://official.example/event',{fetcher,maxBytes:4000000}),/bounded_source_size_required/);
});
