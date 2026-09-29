import test from 'node:test';
import assert from 'node:assert/strict';
import { isTerminalPdfError } from '../../platform/findpitches-v2/providers/fetch/pdf-error-policy.mjs';

test('deterministic PDF failures are terminal immediately', () => {
  for (const code of [
    'findpitches_v2_pdf_no_extractable_text',
    'findpitches_v2_pdf_too_many_pages',
    'findpitches_v2_pdf_invalid_signature',
    'findpitches_v2_fetch_too_large'
  ]) assert.equal(isTerminalPdfError(new Error(code)), true, code);
});

test('timeouts, parse failures and transient HTTP responses remain retryable', () => {
  for (const code of [
    'findpitches_v2_pdf_parse_failed',
    'findpitches_v2_fetch_http_503',
    'The operation was aborted'
  ]) assert.equal(isTerminalPdfError(new Error(code)), false, code);
});
