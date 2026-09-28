// PDF errors that cannot improve with an identical retry.
// Timeouts and parser failures remain retryable because they may be transient.
const TERMINAL_PDF_ERRORS = new Set([
  'findpitches_v2_pdf_no_extractable_text',
  'findpitches_v2_pdf_too_many_pages',
  'findpitches_v2_pdf_invalid_signature'
]);

export function isTerminalPdfError(error) {
  return TERMINAL_PDF_ERRORS.has(String(error?.message ?? error ?? ''));
}
