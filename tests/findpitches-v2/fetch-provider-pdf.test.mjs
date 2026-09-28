import test from 'node:test';
import assert from 'node:assert/strict';
import { createHttpFetchProvider } from '../../platform/findpitches-v2/providers/fetch/http.mjs';

const pdfBytes = new TextEncoder().encode('%PDF-1.7\nmock text for parser injection');
const mockPdf = (bytes) => {
  assert.equal(new TextDecoder().decode(bytes.subarray(0,5)), '%PDF-');
  return 'Vendor application: apply to trade. Applications close 1 May 2027.';
};
function response(body, contentType, url = 'https://example.test/apply.pdf') {
  const r = new Response(body, { headers: { 'content-type': contentType } });
  Object.defineProperty(r, 'url', { value: url });
  return r;
}

test('fetch provider extracts PDF with bounded parser and preserves provenance URL', async () => {
  let called = 0;
  const fetchImpl = async () => response(pdfBytes, 'application/pdf');
  const provider = createHttpFetchProvider({
    fetchImpl,
    pdfExtractor(bytes) { called++; return mockPdf(bytes); }
  });
  const p = await provider.fetch('https://example.test/apply.pdf');
  assert.equal(called, 1);
  assert.equal(p.content_type, 'application/pdf');
  assert.equal(p.final_url, 'https://example.test/apply.pdf');
  assert.match(p.body, /apply to trade/);
});

test('fetch provider accepts genuine PDF bytes served as application/octet-stream', async () => {
  const provider = createHttpFetchProvider({
    fetchImpl: async () => response(pdfBytes, 'application/octet-stream'),
    pdfExtractor: mockPdf
  });
  assert.match((await provider.fetch('https://example.test/apply.pdf')).body, /Vendor application/);
});

test('HTML fetch path remains unchanged and never invokes PDF parser', async () => {
  const provider = createHttpFetchProvider({
    fetchImpl: async () => response('<a href="/apply">Apply to trade</a>', 'text/html', 'https://example.test/'),
    pdfExtractor() { throw new Error('should not parse HTML'); }
  });
  const page = await provider.fetch('https://example.test/');
  assert.match(page.body, /Apply to trade/);
  assert.equal(page.content_type, 'text/html');
});

test('oversized response is rejected before PDF parsing', async () => {
  const provider = createHttpFetchProvider({
    maxBytes: 10,
    fetchImpl: async () => response(pdfBytes, 'application/pdf'),
    pdfExtractor() { throw new Error('should not parse oversized PDF'); }
  });
  await assert.rejects(() => provider.fetch('https://example.test/apply.pdf'), /fetch_too_large/);
});

test('scanned or empty PDFs remain recoverable failures, never accepted as empty evidence', async () => {
  const provider = createHttpFetchProvider({
    fetchImpl: async () => response(pdfBytes, 'application/pdf'),
    pdfExtractor: async () => '   '
  });
  await assert.rejects(() => provider.fetch('https://example.test/apply.pdf'), /pdf_no_extractable_text/);
});

test('malformed PDFs receive a dedicated recoverable error', async () => {
  const provider = createHttpFetchProvider({
    fetchImpl: async () => response('not a PDF', 'application/pdf'),
    pdfExtractor: mockPdf
  });
  await assert.rejects(() => provider.fetch('https://example.test/apply.pdf'), /pdf_invalid_signature/);
});
