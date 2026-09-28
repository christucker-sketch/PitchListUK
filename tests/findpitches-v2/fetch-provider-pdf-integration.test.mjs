import test from 'node:test';
import assert from 'node:assert/strict';
import { createHttpFetchProvider } from '../../platform/findpitches-v2/providers/fetch/http.mjs';

// A real single-page, text-based PDF. This deliberately exercises the actual
// unpdf implementation, rather than the parser stub used in unit tests.
function pdfFixture() {
  const stream = 'BT /F1 12 Tf 72 720 Td (Vendor application - apply to trade) Tj ET\n';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}endstream`
  ];
  let data = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(new TextEncoder().encode(data).length);
    data += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = new TextEncoder().encode(data).length;
  data += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) data += `${String(offset).padStart(10, '0')} 00000 n \n`;
  data += `trailer\n<< /Root 1 0 R /Size ${offsets.length} >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(data);
}

test('actual unpdf parses a genuine text-based PDF through our production fetch path', async () => {
  const bytes = pdfFixture();
  const provider = createHttpFetchProvider({
    fetchImpl: async () => {
      const response = new Response(bytes, {headers: {'content-type':'application/pdf'}});
      Object.defineProperty(response, 'url', {value:'https://example.test/vendor.pdf'});
      return response;
    }
  });
  const page = await provider.fetch('https://example.test/vendor.pdf');
  assert.equal(page.content_type, 'application/pdf');
  assert.match(page.body, /Vendor application/);
  assert.match(page.body, /apply to trade/);
});
