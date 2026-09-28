// Bounded text extraction for born-digital application PDFs. Scanned PDFs remain recoverable.
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export const PDF_MAX_PAGES = 12;
export const PDF_MAX_TEXT_CHARS = 80_000;

export async function extractPdfText(bytes, { maxPages = PDF_MAX_PAGES } = {}) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (data.length < 5 || String.fromCharCode(...data.subarray(0, 5)) !== '%PDF-') throw new Error('findpitches_v2_pdf_invalid');
  let document;
  try {
    document = await getDocument({ data, useSystemFonts: false, disableFontFace: true, isEvalSupported: false, useWorkerFetch: false }).promise;
    if (document.numPages > maxPages) throw new Error('findpitches_v2_pdf_page_limit');
    const parts = [];
    let length = 0;
    for (let n = 1; n <= document.numPages; n++) {
      const page = await document.getPage(n);
      const text = await page.getTextContent();
      const value = text.items.map(item => item.str || '').join(' ').replace(/\\s+/g, ' ').trim();
      length += value.length;
      if (length > PDF_MAX_TEXT_CHARS) throw new Error('findpitches_v2_pdf_text_limit');
      parts.push(value);
      page.cleanup();
    }
    const body = parts.filter(Boolean).join('\\n');
    if (!body.trim()) throw new Error('findpitches_v2_pdf_no_extractable_text');
    return body;
  } finally { await document?.destroy(); }
}
