const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_BYTES = 1_500_000;
const MAX_PDF_PAGES = 12;
const MAX_PDF_TEXT_CHARS = 50_000;

// Load the parser only when a PDF is encountered; ordinary HTML is unaffected.
async function extractPdfText(bytes) {
  const { getDocumentProxy, extractText } = await import('unpdf');
  const pdf = await getDocumentProxy(bytes, { maxImageSize: 16_777_216 });
  try {
    if (pdf.numPages > MAX_PDF_PAGES) throw new Error('findpitches_v2_pdf_too_many_pages');
    const { text } = await extractText(pdf, { mergePages: true });
    return String(text || '');
  } finally {
    await pdf.destroy();
  }
}

async function readBounded(response, maxBytes) {
  if (!response.body?.getReader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw new Error('findpitches_v2_fetch_too_large');
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) throw new Error('findpitches_v2_fetch_too_large');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export function createHttpFetchProvider({
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxBytes = DEFAULT_MAX_BYTES,
  pdfExtractor = extractPdfText,
  userAgent = 'FindPitchesBot/2.0 (+https://findpitches.com)'
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('findpitches_v2_fetch_impl_invalid');
  if (typeof pdfExtractor !== 'function') throw new Error('findpitches_v2_pdf_extractor_invalid');

  return Object.freeze({
    async fetch(url) {
      const target = new URL(String(url));
      if (!['https:', 'http:'].includes(target.protocol)) {
        throw new Error('findpitches_v2_fetch_protocol_rejected');
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort('timeout'), Math.max(1000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS));
      try {
        const response = await fetchImpl(target.toString(), {
          method: 'GET',
          redirect: 'follow',
          signal: controller.signal,
          headers: {
            accept: 'text/html,application/xhtml+xml;q=0.9,application/pdf;q=0.8,text/plain;q=0.7,*/*;q=0.1',
            'user-agent': userAgent
          }
        });
        if (!response.ok) throw new Error(`findpitches_v2_fetch_http_${response.status}`);

        const cap = Math.max(1, Number(maxBytes) || DEFAULT_MAX_BYTES);
        const contentLength = Number(response.headers.get('content-length') || 0);
        if (contentLength > cap) throw new Error('findpitches_v2_fetch_too_large');

        const contentType = String(response.headers.get('content-type') || '').toLowerCase();
        const supportedHtml = /(?:text\/html|application\/xhtml\+xml|text\/plain)/.test(contentType);
        const pdfType = /application\/pdf/.test(contentType);
        const pdfUrl = /\.pdf$/i.test(new URL(response.url || target.toString()).pathname);
        // Reject clearly unrelated responses before downloading them.
        if (!supportedHtml && !pdfType && !pdfUrl && contentType) {
          throw new Error(`findpitches_v2_fetch_content_type_unsupported:${contentType}`);
        }

        const bytes = await readBounded(response, cap);
        const pdfSignature = bytes.length >= 5 && new TextDecoder().decode(bytes.subarray(0, 5)) === '%PDF-';
        if (pdfType || pdfSignature || (pdfUrl && !supportedHtml)) {
          if (!pdfSignature) throw new Error('findpitches_v2_pdf_invalid_signature');
          let body;
          try {
            // The request timeout also bounds parser wall-clock time when it can yield.
            body = await pdfExtractor(bytes);
          } catch (error) {
            if (String(error?.message || '').startsWith('findpitches_v2_pdf_')) throw error;
            throw new Error('findpitches_v2_pdf_parse_failed');
          }
          if (!String(body).trim()) throw new Error('findpitches_v2_pdf_no_extractable_text');
          return Object.freeze({
            requested_url: target.toString(),
            final_url: response.url || target.toString(),
            content_type: 'application/pdf',
            body: String(body).slice(0, MAX_PDF_TEXT_CHARS)
          });
        }
        if (!supportedHtml) throw new Error(`findpitches_v2_fetch_content_type_unsupported:${contentType || 'unknown'}`);
        return Object.freeze({
          requested_url: target.toString(),
          final_url: response.url || target.toString(),
          content_type: contentType,
          body: new TextDecoder().decode(bytes)
        });
      } finally {
        clearTimeout(timer);
      }
    }
  });
}

export { DEFAULT_TIMEOUT_MS, DEFAULT_MAX_BYTES, MAX_PDF_PAGES, MAX_PDF_TEXT_CHARS };
