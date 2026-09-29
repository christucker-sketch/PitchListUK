// Deterministic extraction failures cannot improve with an identical retry.
// The byte limit is fixed by the fetch provider, so an oversized response
// is deterministic as well. Timeouts and parser errors remain retryable.
export const TERMINAL_PDF_ERROR_CODES = Object.freeze([
  'findpitches_v2_pdf_no_extractable_text',
  'findpitches_v2_pdf_too_many_pages',
  'findpitches_v2_pdf_invalid_signature',
  'findpitches_v2_fetch_too_large'
]);

const TERMINAL_PDF_ERRORS = new Set(TERMINAL_PDF_ERROR_CODES);

export function isTerminalPdfError(error) {
  return TERMINAL_PDF_ERRORS.has(String(error?.message ?? error ?? ''));
}
